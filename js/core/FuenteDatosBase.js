/**
 * Clase abstracta: origen de datos (archivo JSON, API REST, memoria...).
 * Permite cambiar de dónde vienen los productos sin tocar la interfaz.
 */
export class FuenteDatosBase {
    constructor() {
        if (new.target === FuenteDatosBase) {
            throw new TypeError('FuenteDatosBase es abstracta y no se puede instanciar.');
        }
    }

    /** @abstract @returns {Promise<Array<object>>} */
    async obtener() {
        throw new Error(`${this.constructor.name} debe implementar obtener().`);
    }
}
