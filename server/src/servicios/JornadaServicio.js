import { ErrorApp } from '../errores.js';
import { ahoraLocal, esFechaValida, hoyLocal } from '../tiempo.js';

function aJornadaDTO(f) {
    return {
        id: f.id,
        usuarioId: f.usuario_id,
        vendedor: f.usuario_nombre,
        turnoId: f.turno_id,
        turno: f.turno_nombre,
        fecha: f.fecha,
        entradaEn: f.entrada_en,
        salidaEn: f.salida_en
    };
}

const CONSULTA_JORNADAS = `SELECT j.*, u.nombre AS usuario_nombre, t.nombre AS turno_nombre
    FROM jornadas j
    JOIN usuarios u ON u.id = j.usuario_id
    LEFT JOIN turnos t ON t.id = j.turno_id`;

/**
 * Asistencia: el vendedor marca entrada y salida. La entrada solo es posible
 * si el administrador le asignó un turno para hoy.
 */
export class JornadaServicio {
    #db;
    #auditoria;
    #notificaciones;

    constructor({ db, auditoria, notificaciones }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#notificaciones = notificaciones;
    }

    activa(usuarioId) {
        const fila = this.#db.prepare(`${CONSULTA_JORNADAS} WHERE j.usuario_id = ? AND j.salida_en IS NULL
            ORDER BY j.id DESC LIMIT 1`).get(usuarioId);
        return fila ? aJornadaDTO(fila) : null;
    }

    entrada(usuario) {
        if (this.activa(usuario.id)) {
            throw new ErrorApp(409, 'Tu entrada ya está registrada. Marca la salida antes de volver a entrar.');
        }

        const hoy = hoyLocal(this.#db);
        const asignacion = this.#db.prepare(`SELECT a.turno_id, t.activo
            FROM asignaciones_turno a JOIN turnos t ON t.id = a.turno_id
            WHERE a.usuario_id = ? AND a.fecha = ?`).get(usuario.id, hoy);
        if (!asignacion) throw new ErrorApp(409, 'No tienes un turno asignado para hoy. Consulta con el administrador.');
        if (asignacion.activo !== 1) throw new ErrorApp(409, 'Tu turno de hoy está inactivo.');

        const r = this.#db.prepare(`INSERT INTO jornadas (usuario_id, turno_id, fecha, entrada_en)
            VALUES (?, ?, ?, ?)`).run(usuario.id, asignacion.turno_id, hoy, ahoraLocal(this.#db));
        this.#auditoria.registrar(usuario.id, 'entrada_turno', 'jornada', Number(r.lastInsertRowid), { fecha: hoy });
        this.#avisarPedidosPendientes(usuario.id);
        return this.activa(usuario.id);
    }

    /** Al entrar al turno, el vendedor recibe los pedidos web que siguen esperando que alguien los atienda. */
    #avisarPedidosPendientes(usuarioId) {
        const pendientes = this.#db.prepare(`SELECT id FROM pedidos
                WHERE origen = 'web' AND estado = 'pendiente_pago' AND vendedor_id IS NULL ORDER BY id`).all();
        if (pendientes.length === 0) return;
        const numeros = pendientes.slice(0, 10).map(p => `#${p.id}`).join(', ');
        const extra = pendientes.length > 10 ? ` y ${pendientes.length - 10} más` : '';
        this.#notificaciones.crear(usuarioId,
            `Pedidos web pendientes de atender: ${numeros}${extra}. Atiéndelos desde «Pedidos web».`);
    }

    salida(usuario) {
        const abierta = this.activa(usuario.id);
        if (!abierta) throw new ErrorApp(409, 'No tienes una entrada abierta.');

        this.#db.prepare(`UPDATE jornadas SET salida_en = ? WHERE id = ?`)
            .run(ahoraLocal(this.#db), abierta.id);
        this.#auditoria.registrar(usuario.id, 'salida_turno', 'jornada', abierta.id, { fecha: abierta.fecha });
        return null;
    }

    /** Vista del administrador: quién registró jornada en una fecha. */
    listarPorFecha(fecha) {
        const dia = fecha ?? hoyLocal(this.#db);
        if (!esFechaValida(dia)) throw new ErrorApp(400, 'Fecha no válida.');
        return this.#db.prepare(`${CONSULTA_JORNADAS} WHERE j.fecha = ? ORDER BY j.entrada_en`)
            .all(dia).map(aJornadaDTO);
    }
}
