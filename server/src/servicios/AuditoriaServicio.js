/** Registro de acciones administrativas (quién, qué, cuándo y los cambios). */
export class AuditoriaServicio {
    #db;

    constructor({ db }) {
        this.#db = db;
    }

    registrar(usuarioId, accion, entidad, entidadId, detalle = null) {
        this.#db.prepare(`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
            VALUES (?, ?, ?, ?, ?)`)
            .run(usuarioId ?? null, accion, entidad,
                entidadId == null ? null : String(entidadId),
                detalle == null ? null : JSON.stringify(detalle));
    }

    listar(limite = 200) {
        return this.#db.prepare(`SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.creado_en,
                u.email AS usuario_email
            FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
            ORDER BY a.id DESC LIMIT ?`)
            .all(limite)
            .map(f => ({ ...f, detalle: f.detalle ? JSON.parse(f.detalle) : null }));
    }
}
