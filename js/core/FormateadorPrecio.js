/**
 * Formatea valores en pesos colombianos ($59.000).
 * Antes existían DOS copias de `formatearPrecio` (en ui.js y en carritoUI.js);
 * ahora hay una sola fuente de verdad.
 */
export class FormateadorPrecio {
    #locale;
    #simbolo;

    constructor(locale = 'es-CO', simbolo = '$') {
        this.#locale = locale;
        this.#simbolo = simbolo;
    }

    formatear(valor) {
        if (!valor) return '';
        return this.#simbolo + Number(valor).toLocaleString(this.#locale);
    }

    /** Igual que formatear, pero muestra "$0" en vez de vacío (para totales). */
    formatearTotal(valor) {
        return valor ? this.formatear(valor) : `${this.#simbolo}0`;
    }
}
