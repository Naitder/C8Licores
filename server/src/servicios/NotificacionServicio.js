import { ErrorApp } from '../errores.js';

/**
 * Avisos dentro de la aplicación (se muestran en el perfil del usuario).
 * Más adelante, el mismo método podrá enviar también un correo.
 */
export class NotificacionServicio {
    #db;

    constructor({ db }) {
        this.#db = db;
    }

    crear(usuarioId, mensaje) {
        this.#db.prepare('INSERT INTO notificaciones (usuario_id, mensaje) VALUES (?, ?)')
            .run(usuarioId, mensaje);
    }

    listarPara(usuarioId, limite = 50) {
        return this.#db.prepare(`SELECT id, mensaje, leida, creado_en FROM notificaciones
            WHERE usuario_id = ? ORDER BY id DESC LIMIT ?`)
            .all(usuarioId, limite)
            .map(f => ({ id: f.id, mensaje: f.mensaje, leida: f.leida === 1, creadoEn: f.creado_en }));
    }

    noLeidas(usuarioId) {
        return this.#db.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND leida = 0')
            .get(usuarioId).n;
    }

    marcarLeida(usuarioId, id) {
        const r = this.#db.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?')
            .run(id, usuarioId);
        if (Number(r.changes) === 0) throw new ErrorApp(404, 'Notificación no encontrada.');
    }
}
