import { BaseUI } from './BaseUI.js';

/**
 * Pieza de interfaz que construye un nodo nuevo (no depende de ids del HTML).
 */
export class ElementoUI extends BaseUI {
    constructor(documento) {
        super(documento);
        if (new.target === ElementoUI) {
            throw new TypeError('ElementoUI es abstracta y no se puede instanciar.');
        }
    }

    /** @abstract @returns {HTMLElement} */
    renderizar() {
        throw new Error(`${this.constructor.name} debe implementar renderizar().`);
    }
}
