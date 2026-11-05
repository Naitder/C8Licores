/**
 * Raíz de la jerarquía de interfaz. Reúne las utilidades de DOM que se
 * repetían en ui.js, carritoUI.js y user.js (getElementById, createElement,
 * className, textContent...).
 *
 *   BaseUI
 *   ├── ComponenteUI  (controla una parte de la página ya existente)
 *   │   └── FormularioBase
 *   │       ├── FormularioLogin
 *   │       └── FormularioRegistro
 *   └── ElementoUI    (fabrica un nodo nuevo: tarjeta, fila del carrito)
 */
export class BaseUI {
    #documento;

    constructor(documento = globalThis.document) {
        if (new.target === BaseUI) {
            throw new TypeError('BaseUI es abstracta y no se puede instanciar.');
        }
        this.#documento = documento;
    }

    /** @protected */
    get documento() { return this.#documento; }

    /** @protected Atajo de document.getElementById. */
    obtener(id) {
        return this.#documento.getElementById(id);
    }

    /**
     * @protected Crea un elemento con clase y texto en una sola línea.
     * @param {string} etiqueta
     * @param {{clase?: string, texto?: string|number}} opciones
     */
    crear(etiqueta, { clase = '', texto } = {}) {
        const elemento = this.#documento.createElement(etiqueta);
        if (clase) elemento.className = clase;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }
}
