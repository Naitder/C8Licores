/**
 * Implementación mínima del patrón Observador.
 * Las clases que heredan de aquí pueden avisar de cambios sin conocer
 * quién las escucha (bajo acoplamiento). Ej.: CarritoServicio avisa y
 * VistaCarrito se vuelve a dibujar sola.
 */
export class EmisorEventos {
    #oyentes = new Map();

    /**
     * @param {string} evento
     * @param {Function} callback
     * @returns {Function} función para cancelar la suscripción
     */
    suscribir(evento, callback) {
        if (!this.#oyentes.has(evento)) this.#oyentes.set(evento, new Set());
        this.#oyentes.get(evento).add(callback);
        return () => this.#oyentes.get(evento)?.delete(callback);
    }

    /** @protected */
    emitir(evento, datos) {
        this.#oyentes.get(evento)?.forEach(callback => callback(datos));
    }
}
