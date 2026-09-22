import { FuenteDatosBase } from './FuenteDatosBase.js';

/** Lee un archivo JSON con `fetch` (lo que hacían cargarTarjetas e iniciarApp). */
export class FuenteDatosJSON extends FuenteDatosBase {
    #url;

    constructor(url) {
        super();
        this.#url = url;
    }

    async obtener() {
        const respuesta = await fetch(this.#url);
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar ${this.#url} (HTTP ${respuesta.status})`);
        }
        return respuesta.json();
    }
}
