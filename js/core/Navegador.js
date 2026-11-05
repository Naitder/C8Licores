/**
 * Encapsula las redirecciones (`window.location.href = ...`).
 * Al inyectarlo en los componentes se puede probar la lógica sin
 * cambiar realmente de página.
 */
export class Navegador {
    #ventana;

    constructor(ventana = globalThis.window) {
        this.#ventana = ventana;
    }

    irA(ruta) {
        this.#ventana.location.href = ruta;
    }
}
