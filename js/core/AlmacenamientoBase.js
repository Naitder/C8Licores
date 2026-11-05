/**
 * Clase abstracta: contrato de cualquier mecanismo de almacenamiento.
 *
 * SOLID:
 *  - D (Inversión de dependencias): los servicios dependen de esta abstracción,
 *    no de `localStorage` directamente.
 *  - L (Sustitución de Liskov): cualquier subclase (Local, Memoria...) puede
 *    usarse en su lugar sin romper a quien la consume.
 */
export class AlmacenamientoBase {
    constructor() {
        if (new.target === AlmacenamientoBase) {
            throw new TypeError('AlmacenamientoBase es abstracta y no se puede instanciar.');
        }
    }

    /** @abstract @param {string} clave @returns {string|null} */
    leer(clave) {
        throw new Error(`${this.constructor.name} debe implementar leer().`);
    }

    /** @abstract @param {string} clave @param {string} valor */
    escribir(clave, valor) {
        throw new Error(`${this.constructor.name} debe implementar escribir().`);
    }

    /** @abstract @param {string} clave */
    eliminar(clave) {
        throw new Error(`${this.constructor.name} debe implementar eliminar().`);
    }

    /**
     * Lee y convierte JSON de forma segura (método plantilla, lo heredan todas
     * las subclases). Reemplaza los bloques try/catch que estaban repetidos.
     */
    leerJSON(clave, porDefecto = null) {
        const crudo = this.leer(clave);
        if (crudo === null || crudo === undefined || crudo === 'null' || crudo === 'undefined') {
            return porDefecto;
        }
        try {
            return JSON.parse(crudo) ?? porDefecto;
        } catch (error) {
            console.error(`Error leyendo "${clave}":`, error);
            return porDefecto;
        }
    }

    escribirJSON(clave, valor) {
        this.escribir(clave, JSON.stringify(valor));
    }
}
