import { ReglaValidacion } from './ReglaValidacion.js';

/** Dos campos deben ser iguales (p. ej. contraseña y confirmación). */
export class ReglaCamposIguales extends ReglaValidacion {
    #campoA;
    #campoB;

    constructor(campoA, campoB, mensaje) {
        super(mensaje);
        this.#campoA = campoA;
        this.#campoB = campoB;
    }

    esValido(datos) {
        return datos[this.#campoA] === datos[this.#campoB];
    }
}
