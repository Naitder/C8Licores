import { ErrorApp } from '../errores.js';

/** Permisos que el administrador puede conceder a un vendedor. Por defecto ninguno. */
export const PERMISOS = Object.freeze({
    editar_stock: 'Ajustar existencias (recepción de mercancía)',
    editar_precios: 'Cambiar precios',
    gestionar_promociones: 'Crear y quitar precios promocionales',
    editar_productos: 'Editar datos de productos (nombre, descripción, imagen, medida, categoría, visibilidad)'
});

/** Administra qué puede hacer cada vendedor. El superadministrador siempre puede todo. */
export class PermisoServicio {
    #db;
    #notificaciones;
    #auditoria;

    constructor({ db, notificaciones, auditoria }) {
        this.#db = db;
        this.#notificaciones = notificaciones;
        this.#auditoria = auditoria;
    }

    listar(usuarioId) {
        return this.#db.prepare('SELECT permiso FROM permisos_usuario WHERE usuario_id = ? ORDER BY permiso')
            .all(usuarioId).map(f => f.permiso);
    }

    /** Permisos efectivos: el superadministrador tiene todos. */
    efectivos(usuario) {
        if (usuario.rol === 'superadmin') return Object.keys(PERMISOS);
        return usuario.rol === 'vendedor' ? this.listar(usuario.id) : [];
    }

    tiene(usuario, permiso) {
        return this.efectivos(usuario).includes(permiso);
    }

    listarVendedores() {
        return this.#db.prepare(`SELECT id, nombre, email, activo FROM usuarios
                WHERE rol = 'vendedor' ORDER BY nombre, id`)
            .all().map(v => ({
                id: v.id,
                nombre: v.nombre,
                email: v.email,
                activo: v.activo === 1,
                permisos: this.listar(v.id)
            }));
    }

    establecer(usuarioId, permisos, actor) {
        if (!Array.isArray(permisos) || permisos.some(p => !(p in PERMISOS))) {
            throw new ErrorApp(400, 'Datos no válidos.', { permisos: 'Hay un permiso que no existe.' });
        }
        const usuario = this.#db.prepare(`SELECT id, rol, nombre FROM usuarios WHERE id = ?`).get(usuarioId);
        if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado.');
        if (usuario.rol !== 'vendedor') {
            throw new ErrorApp(409, 'Solo se pueden asignar permisos a vendedores.');
        }

        const anteriores = this.listar(usuarioId);
        const nuevos = [...new Set(permisos)];
        this.#db.exec('BEGIN');
        try {
            this.#db.prepare('DELETE FROM permisos_usuario WHERE usuario_id = ?').run(usuarioId);
            const insertar = this.#db.prepare('INSERT INTO permisos_usuario (usuario_id, permiso) VALUES (?, ?)');
            for (const p of nuevos) insertar.run(usuarioId, p);
            this.#db.exec('COMMIT');
        } catch (error) {
            this.#db.exec('ROLLBACK');
            throw error;
        }

        const texto = nuevos.length
            ? nuevos.map(p => PERMISOS[p]).join('; ')
            : 'ninguno (solo puedes vender)';
        this.#notificaciones.crear(usuarioId, `Tus permisos fueron actualizados: ${texto}.`);
        this.#auditoria.registrar(actor.id, 'actualizar_permisos', 'usuario', usuarioId, {
            antes: anteriores, despues: nuevos
        });
        return nuevos;
    }
}
