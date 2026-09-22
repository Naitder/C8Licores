/**
 * Agrupa reglas y devuelve el primer error encontrado.
 * Para añadir una validación nueva basta con `agregarRegla(...)`:
 * el formulario de registro no cambia (Abierto/Cerrado).
 */
export class Validador {
    #reglas = [];

    constructor(reglas = []) {
        reglas.forEach(regla => this.agregarRegla(regla));
    }

    agregarRegla(regla) {
        this.#reglas.push(regla);
        return this;
    }

    /** @returns {string|null} */
    validar(datos) {
        for (const regla of this.#reglas) {
            const error = regla.validar(datos);
            if (error) return error;
        }
        return null;
    }
}
