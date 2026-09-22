/**
 * Clase abstracta: una regla de validación de formulario.
 * @abstract
 */
export class ReglaValidacion {
    #mensaje;

    constructor(mensaje) {
        if (new.target === ReglaValidacion) {
            throw new TypeError('ReglaValidacion es abstracta y no se puede instanciar.');
        }
        this.#mensaje = mensaje;
    }

    get mensaje() { return this.#mensaje; }

    /** @abstract @param {object} datos @returns {boolean} true si es válido */
    esValido(datos) {
        throw new Error(`${this.constructor.name} debe implementar esValido().`);
    }

    /** @returns {string|null} mensaje de error o null si pasa. */
    validar(datos) {
        return this.esValido(datos) ? null : this.#mensaje;
    }
}
