import { AlmacenamientoBase } from './AlmacenamientoBase.js';

/**
 * Implementación concreta sobre `window.localStorage`.
 * Es la que usa la aplicación en el navegador.
 */
export class AlmacenamientoLocal extends AlmacenamientoBase {
    #storage;

    constructor(storage = globalThis.localStorage) {
        super();
        this.#storage = storage;
    }

    leer(clave) {
        return this.#storage.getItem(clave);
    }

    escribir(clave, valor) {
        this.#storage.setItem(clave, valor);
    }

    eliminar(clave) {
        this.#storage.removeItem(clave);
    }
}
