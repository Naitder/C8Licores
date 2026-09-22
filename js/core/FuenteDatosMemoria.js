import { FuenteDatosBase } from './FuenteDatosBase.js';

/** Fuente de datos fija en memoria, útil para pruebas o datos de ejemplo. */
export class FuenteDatosMemoria extends FuenteDatosBase {
    #datos;

    constructor(datos = []) {
        super();
        this.#datos = datos;
    }

    async obtener() {
        return structuredClone(this.#datos);
    }
}
