import { EstrategiaBusqueda } from './EstrategiaBusqueda.js';
import { Levenshtein } from './Levenshtein.js';

/**
 * Búsqueda tolerante a errores de escritura: coincide si el nombre contiene
 * el texto o si la similitud Levenshtein supera el umbral.
 * (Antes: función filtrarPorSimilitud).
 */
export class BusquedaSimilitud extends EstrategiaBusqueda {
    #umbral;

    constructor(umbral = 0.4) {
        super();
        this.#umbral = umbral;
    }

    get umbral() { return this.#umbral; }

    coincide(nombre, termino) {
        if (nombre.includes(termino)) return true;
        return Levenshtein.similitud(nombre, termino) >= this.#umbral;
    }
}
