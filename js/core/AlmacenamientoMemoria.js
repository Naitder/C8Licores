import { AlmacenamientoBase } from './AlmacenamientoBase.js';

/**
 * Implementación en memoria (se pierde al recargar).
 * Sirve para pruebas automáticas o como respaldo si localStorage no existe.
 * Demuestra el principio de Liskov: sustituye a AlmacenamientoLocal sin cambios.
 */
export class AlmacenamientoMemoria extends AlmacenamientoBase {
    #datos = new Map();

    leer(clave) {
        return this.#datos.has(clave) ? this.#datos.get(clave) : null;
    }

    escribir(clave, valor) {
        this.#datos.set(clave, String(valor));
    }

    eliminar(clave) {
        this.#datos.delete(clave);
    }
}
