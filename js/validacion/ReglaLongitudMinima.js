import { ReglaValidacion } from './ReglaValidacion.js';

/** El campo indicado debe tener al menos `minimo` caracteres. */
export class ReglaLongitudMinima extends ReglaValidacion {
    #campo;
    #minimo;

    constructor(campo, minimo, mensaje) {
        super(mensaje);
        this.#campo = campo;
        this.#minimo = minimo;
    }

    esValido(datos) {
        return String(datos[this.#campo] ?? '').length >= this.#minimo;
    }
}
