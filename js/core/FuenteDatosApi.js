import { FuenteDatosBase } from './FuenteDatosBase.js';

/**
 * Lee el catálogo público desde el servidor (/api/productos).
 * Así la tienda muestra lo que el administrador deja activo, con precios y
 * promociones vigentes; ya no depende de un archivo JSON estático.
 */
export class FuenteDatosApi extends FuenteDatosBase {
    #url;

    constructor(url) {
        super();
        this.#url = url;
    }

    async obtener() {
        const respuesta = await fetch(this.#url, { credentials: 'same-origin' });
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar el catálogo (HTTP ${respuesta.status})`);
        }
        const datos = await respuesta.json();
        return Array.isArray(datos.productos) ? datos.productos : [];
    }
}
