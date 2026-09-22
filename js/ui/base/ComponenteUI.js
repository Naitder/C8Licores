import { BaseUI } from './BaseUI.js';

/**
 * Componente que se "monta" sobre elementos que ya existen en el HTML.
 *
 * Patrón Método Plantilla: `montar()` es igual para todos; cada subclase solo
 * define `estaDisponible()` (¿existe en esta página?) y `alMontar()` (qué hace).
 * Así se reemplazan los "escudos" `if (!elemento) return;` repetidos.
 */
export class ComponenteUI extends BaseUI {
    constructor(documento) {
        super(documento);
        if (new.target === ComponenteUI) {
            throw new TypeError('ComponenteUI es abstracta y no se puede instanciar.');
        }
    }

    /** @returns {boolean} si los elementos que necesita existen en la página. */
    estaDisponible() {
        return true;
    }

    /** @abstract */
    alMontar() {
        throw new Error(`${this.constructor.name} debe implementar alMontar().`);
    }

    /** @returns {Promise<boolean>} true si el componente se activó. */
    async montar() {
        if (!this.estaDisponible()) return false;
        await this.alMontar();
        return true;
    }
}
