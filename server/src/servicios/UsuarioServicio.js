import { ErrorApp } from '../errores.js';

export const ROLES = Object.freeze(['superadmin', 'vendedor', 'cliente']);

function aDTO(f) {
    return {
        id: f.id,
        nombre: f.nombre,
        email: f.email,
        rol: f.rol,
        activo: f.activo === 1,
        creadoEn: f.creado_en
    };
}

/**
 * Administración de cuentas. Solo el superadministrador la usa (ver rutas).
 * Un administrador nunca puede cambiar su propio rol ni suspenderse, y
 * siempre debe quedar al menos un superadministrador activo.
 */
export class UsuarioServicio {
    #db;
    #auditoria;
    #notificaciones;
    #adminPrincipal;

    constructor({ db, auditoria, notificaciones, adminPrincipal }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#notificaciones = notificaciones;
        this.#adminPrincipal = String(adminPrincipal ?? '').toLowerCase();
    }

    /** El administrador principal es la cuenta creada con ADMIN_EMAIL. */
    #esPrincipal(fila) {
        return String(fila.email).toLowerCase() === this.#adminPrincipal;
    }

    listar() {
        return this.#db.prepare('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id')
            .all().map(aDTO);
    }

    actualizar(id, { rol, activo } = {}, actor) {
        if (id === actor.id) {
            throw new ErrorApp(403, 'No puedes cambiar tu propio rol ni suspender tu cuenta.');
        }
        const fila = this.#db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        if (!fila) throw new ErrorApp(404, 'Usuario no encontrado.');

        // La cuenta principal no la modifica nadie más, y solo ella puede dar o quitar superadministración.
        const actorFila = this.#db.prepare('SELECT email FROM usuarios WHERE id = ?').get(actor.id);
        const actorEsPrincipal = actorFila ? this.#esPrincipal(actorFila) : false;
        if (this.#esPrincipal(fila)) {
            throw new ErrorApp(403, 'La cuenta del administrador principal no se puede modificar.');
        }
        if (!actorEsPrincipal && (fila.rol === 'superadmin' || rol === 'superadmin')) {
            throw new ErrorApp(403, 'Solo el administrador principal puede asignar o quitar superadministradores.');
        }

        if (rol !== undefined && !ROLES.includes(rol)) {
            throw new ErrorApp(400, 'Datos no válidos.', { rol: 'Rol no válido.' });
        }
        const nuevoRol = rol ?? fila.rol;
        const nuevoActivo = activo === undefined ? fila.activo : (activo ? 1 : 0);

        if (fila.rol === 'superadmin' && (nuevoRol !== 'superadmin' || nuevoActivo === 0)) {
            const otros = this.#db.prepare(`SELECT COUNT(*) AS n FROM usuarios
                WHERE rol = 'superadmin' AND activo = 1 AND id != ?`).get(id).n;
            if (otros === 0) throw new ErrorApp(409, 'Debe existir al menos un superadministrador activo.');
        }

        this.#db.prepare(`UPDATE usuarios SET rol = ?, activo = ?, actualizado_en = datetime('now') WHERE id = ?`)
            .run(nuevoRol, nuevoActivo, id);
        if (nuevoActivo === 0) this.#db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);

        // Al dejar de ser vendedor pierde sus permisos y sus turnos futuros.
        if (fila.rol !== nuevoRol) {
            if (fila.rol === 'vendedor') {
                this.#db.prepare('DELETE FROM permisos_usuario WHERE usuario_id = ?').run(id);
                this.#db.prepare(`DELETE FROM asignaciones_turno
                    WHERE usuario_id = ? AND fecha >= date('now', 'localtime')`).run(id);
            }
            if (nuevoRol === 'vendedor') {
                this.#notificaciones.crear(id, 'Tu cuenta ahora es de vendedor. Al iniciar sesión verás el módulo de vendedor.');
            }
        }

        this.#auditoria.registrar(actor.id, 'actualizar_usuario', 'usuario', id, {
            antes: { rol: fila.rol, activo: fila.activo === 1 },
            despues: { rol: nuevoRol, activo: nuevoActivo === 1 }
        });
        return aDTO(this.#db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id));
    }
}
