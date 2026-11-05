import { ErrorApp } from '../errores.js';
import { esFechaValida, esHoraValida, hoyLocal } from '../tiempo.js';

const DIAS_PROXIMOS = 14;

function aTurnoDTO(f) {
    return {
        id: f.id,
        nombre: f.nombre,
        horaInicio: f.hora_inicio,
        horaFin: f.hora_fin,
        activo: f.activo === 1
    };
}

function aAsignacionDTO(f) {
    return {
        id: f.id,
        fecha: f.fecha,
        usuarioId: f.usuario_id,
        vendedor: f.usuario_nombre,
        email: f.usuario_email,
        turnoId: f.turno_id,
        turno: f.turno_nombre,
        horaInicio: f.hora_inicio,
        horaFin: f.hora_fin
    };
}

const CONSULTA_ASIGNACIONES = `SELECT a.id, a.fecha, a.usuario_id, a.turno_id,
        u.nombre AS usuario_nombre, u.email AS usuario_email,
        t.nombre AS turno_nombre, t.hora_inicio, t.hora_fin
    FROM asignaciones_turno a
    JOIN usuarios u ON u.id = a.usuario_id
    JOIN turnos t ON t.id = a.turno_id`;

/**
 * Turnos fijos (mañana, tarde, noche...) que el administrador puede editar,
 * y asignaciones de vendedores a turnos por fecha. Cada cambio que afecta a
 * un vendedor se le notifica en su perfil.
 */
export class TurnoServicio {
    #db;
    #notificaciones;
    #auditoria;

    constructor({ db, notificaciones, auditoria }) {
        this.#db = db;
        this.#notificaciones = notificaciones;
        this.#auditoria = auditoria;
    }

    // ---- Turnos ----

    listar() {
        return this.#db.prepare('SELECT * FROM turnos ORDER BY hora_inicio, id').all().map(aTurnoDTO);
    }

    crear(datos, actor) {
        const v = this.#validar(datos);
        const existe = this.#db.prepare('SELECT 1 FROM turnos WHERE nombre = ?').get(v.nombre);
        if (existe) throw new ErrorApp(409, 'Ya existe un turno con ese nombre.');

        const r = this.#db.prepare(`INSERT INTO turnos (nombre, hora_inicio, hora_fin, activo) VALUES (?, ?, ?, ?)`)
            .run(v.nombre, v.horaInicio, v.horaFin, v.activo);
        const id = Number(r.lastInsertRowid);
        this.#auditoria.registrar(actor.id, 'crear_turno', 'turno', id, { nombre: v.nombre });
        return this.#dto(id);
    }

    actualizar(id, datos, actor) {
        const actual = this.#db.prepare('SELECT * FROM turnos WHERE id = ?').get(id);
        if (!actual) throw new ErrorApp(404, 'Turno no encontrado.');

        const v = this.#validar(datos, actual);
        this.#db.prepare(`UPDATE turnos SET nombre = ?, hora_inicio = ?, hora_fin = ?, activo = ?,
                actualizado_en = datetime('now') WHERE id = ?`)
            .run(v.nombre, v.horaInicio, v.horaFin, v.activo, id);

        const horarioCambio = v.horaInicio !== actual.hora_inicio || v.horaFin !== actual.hora_fin;
        const estadoCambio = v.activo !== actual.activo;
        if (horarioCambio || estadoCambio || v.nombre !== actual.nombre) {
            const hoy = hoyLocal(this.#db);
            const futuras = this.#db.prepare(`SELECT usuario_id, fecha FROM asignaciones_turno
                WHERE turno_id = ? AND fecha >= ?`).all(id, hoy);
            for (const a of futuras) {
                const mensaje = !v.activo
                    ? `El turno "${v.nombre}" del ${a.fecha} fue desactivado por el administrador.`
                    : `Tu turno del ${a.fecha} cambió: "${v.nombre}", de ${v.horaInicio} a ${v.horaFin}.`;
                this.#notificaciones.crear(a.usuario_id, mensaje);
            }
        }

        this.#auditoria.registrar(actor.id, 'actualizar_turno', 'turno', id, {
            antes: { nombre: actual.nombre, horaInicio: actual.hora_inicio, horaFin: actual.hora_fin, activo: actual.activo === 1 },
            despues: { nombre: v.nombre, horaInicio: v.horaInicio, horaFin: v.horaFin, activo: v.activo === 1 }
        });
        return this.#dto(id);
    }

    // ---- Asignaciones ----

    listarAsignaciones({ desde, hasta } = {}) {
        const hoy = hoyLocal(this.#db);
        const inicio = desde ?? hoy;
        const fin = hasta ?? this.#sumarDias(hoy, DIAS_PROXIMOS);
        if (!esFechaValida(inicio) || !esFechaValida(fin) || fin < inicio) {
            throw new ErrorApp(400, 'Rango de fechas no válido.');
        }
        return this.#db.prepare(`${CONSULTA_ASIGNACIONES} WHERE a.fecha BETWEEN ? AND ?
            ORDER BY a.fecha, t.hora_inicio, u.nombre`)
            .all(inicio, fin).map(aAsignacionDTO);
    }

    /** Turno del vendedor para una fecha (por defecto hoy), o null. */
    asignacionDelDia(usuarioId, fecha = hoyLocal(this.#db)) {
        const fila = this.#db.prepare(`${CONSULTA_ASIGNACIONES} WHERE a.usuario_id = ? AND a.fecha = ?`)
            .get(usuarioId, fecha);
        return fila ? aAsignacionDTO(fila) : null;
    }

    proximasPara(usuarioId, dias = DIAS_PROXIMOS) {
        const hoy = hoyLocal(this.#db);
        return this.#db.prepare(`${CONSULTA_ASIGNACIONES} WHERE a.usuario_id = ? AND a.fecha BETWEEN ? AND ?
            ORDER BY a.fecha, t.hora_inicio`)
            .all(usuarioId, hoy, this.#sumarDias(hoy, dias)).map(aAsignacionDTO);
    }

    /** Asigna un turno a un vendedor en una fecha. Si ya tenía uno ese día, lo reemplaza. */
    asignar(datos, actor) {
        const errores = {};
        const usuarioId = Number(datos?.usuarioId);
        const turnoId = Number(datos?.turnoId);
        const fecha = datos?.fecha;
        if (!Number.isInteger(usuarioId) || usuarioId <= 0) errores.usuarioId = 'Elige un vendedor.';
        if (!Number.isInteger(turnoId) || turnoId <= 0) errores.turnoId = 'Elige un turno.';
        if (!esFechaValida(fecha)) errores.fecha = 'Fecha no válida.';
        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);

        const hoy = hoyLocal(this.#db);
        if (fecha < hoy) throw new ErrorApp(409, 'No se pueden asignar turnos en fechas pasadas.');

        const usuario = this.#db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE id = ?').get(usuarioId);
        if (!usuario) throw new ErrorApp(404, 'Vendedor no encontrado.');
        if (usuario.rol !== 'vendedor') throw new ErrorApp(409, 'Solo se pueden asignar turnos a vendedores.');
        if (usuario.activo !== 1) throw new ErrorApp(409, 'Ese vendedor está suspendido.');

        const turno = this.#db.prepare('SELECT * FROM turnos WHERE id = ?').get(turnoId);
        if (!turno) throw new ErrorApp(404, 'Turno no encontrado.');
        if (turno.activo !== 1) throw new ErrorApp(409, 'Ese turno está inactivo.');

        const anterior = this.#db.prepare('SELECT t.nombre FROM asignaciones_turno a JOIN turnos t ON t.id = a.turno_id WHERE a.usuario_id = ? AND a.fecha = ?')
            .get(usuarioId, fecha);

        this.#db.prepare(`INSERT INTO asignaciones_turno (usuario_id, turno_id, fecha, creado_por)
                VALUES (?, ?, ?, ?)
            ON CONFLICT(usuario_id, fecha) DO UPDATE SET turno_id = excluded.turno_id,
                creado_por = excluded.creado_por, creado_en = datetime('now')`)
            .run(usuarioId, turnoId, fecha, actor.id);

        const detalle = `${turno.nombre} (${turno.hora_inicio} a ${turno.hora_fin})`;
        this.#notificaciones.crear(usuarioId, anterior
            ? `Tu turno del ${fecha} cambió de "${anterior.nombre}" a ${detalle}.`
            : `Te asignaron el turno ${detalle} el ${fecha}.`);
        this.#auditoria.registrar(actor.id, 'asignar_turno', 'usuario', usuarioId, {
            fecha, antes: anterior?.nombre ?? null, despues: turno.nombre
        });

        const fila = this.#db.prepare(`${CONSULTA_ASIGNACIONES} WHERE a.usuario_id = ? AND a.fecha = ?`)
            .get(usuarioId, fecha);
        return aAsignacionDTO(fila);
    }

    quitarAsignacion(id, actor) {
        const fila = this.#db.prepare(`${CONSULTA_ASIGNACIONES} WHERE a.id = ?`).get(id);
        if (!fila) throw new ErrorApp(404, 'Asignación no encontrada.');
        // Los turnos pasados son historial: se consultan, no se quitan.
        if (fila.fecha < hoyLocal(this.#db)) throw new ErrorApp(409, 'No se puede quitar un turno de una fecha pasada.');

        this.#db.prepare('DELETE FROM asignaciones_turno WHERE id = ?').run(id);
        this.#notificaciones.crear(fila.usuario_id,
            `Se quitó tu turno "${fila.turno_nombre}" del ${fila.fecha}.`);
        this.#auditoria.registrar(actor.id, 'quitar_turno', 'usuario', fila.usuario_id, {
            fecha: fila.fecha, turno: fila.turno_nombre
        });
    }

    // ---- Auxiliares ----

    #validar(datos = {}, actual = null) {
        const errores = {};
        const nombre = 'nombre' in datos ? String(datos.nombre ?? '').trim() : actual?.nombre ?? '';
        const horaInicio = 'horaInicio' in datos ? String(datos.horaInicio ?? '') : actual?.hora_inicio ?? '';
        const horaFin = 'horaFin' in datos ? String(datos.horaFin ?? '') : actual?.hora_fin ?? '';
        const activo = 'activo' in datos ? (datos.activo ? 1 : 0) : (actual?.activo ?? 1);

        if (!nombre || nombre.length > 40) errores.nombre = 'El nombre es obligatorio (máximo 40 caracteres).';
        if (!esHoraValida(horaInicio)) errores.horaInicio = 'Usa el formato HH:MM.';
        if (!esHoraValida(horaFin)) errores.horaFin = 'Usa el formato HH:MM.';
        if (!errores.horaInicio && !errores.horaFin && horaFin <= horaInicio) {
            errores.horaFin = 'La hora de fin debe ser posterior a la de inicio.';
        }
        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
        return { nombre, horaInicio, horaFin, activo };
    }

    #sumarDias(fecha, dias) {
        return this.#db.prepare(`SELECT date(?, ?) AS f`).get(fecha, `+${dias} days`).f;
    }

    #dto(id) {
        return aTurnoDTO(this.#db.prepare('SELECT * FROM turnos WHERE id = ?').get(id));
    }
}
