import { ErrorApp } from '../errores.js';
import { aProductoDTO } from './ProductoServicio.js';
import { promocionActiva } from './PromocionServicio.js';

/** Productos guardados por cada usuario ("Guardados" en su perfil). */
export class FavoritosServicio {
    #db;

    constructor({ db }) {
        this.#db = db;
    }

    /** Productos guardados con el mismo precio y promoción que muestra la tienda. */
    listar(usuario) {
        return this.#db.prepare(`SELECT p.* FROM favoritos f JOIN productos p ON p.id = f.producto_id
                WHERE f.usuario_id = ? ORDER BY f.creado_en DESC`)
            .all(usuario.id)
            .map(fila => {
                const producto = aProductoDTO(fila, promocionActiva(this.#db, fila.id));
                return { ...producto, disponible: producto.estado === 'disponible' && producto.stock > 0 };
            });
    }

    guardar(usuario, productoId) {
        const existe = this.#db.prepare('SELECT 1 FROM productos WHERE id = ?').get(productoId);
        if (!existe) throw new ErrorApp(404, 'Producto no encontrado.');
        this.#db.prepare('INSERT OR IGNORE INTO favoritos (usuario_id, producto_id) VALUES (?, ?)')
            .run(usuario.id, productoId);
    }

    quitar(usuario, productoId) {
        this.#db.prepare('DELETE FROM favoritos WHERE usuario_id = ? AND producto_id = ?')
            .run(usuario.id, productoId);
    }
}
