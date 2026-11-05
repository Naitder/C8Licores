/**
 * Convierte los datos crudos de una fuente en objetos del modelo.
 * Es genérico: se usa tanto para el catálogo (Producto) como para el slider
 * (Diapositiva) cambiando solo la función de conversión.
 */
export class RepositorioLectura {
    #fuente;
    #convertir;
    #cache = null;

    /**
     * @param {import('./FuenteDatosBase.js').FuenteDatosBase} fuente
     * @param {(dato: object) => any} convertir  p.ej. Producto.desdeJSON
     */
    constructor(fuente, convertir) {
        this.#fuente = fuente;
        this.#convertir = convertir;
    }

    async obtenerTodos() {
        if (this.#cache === null) {
            const crudos = await this.#fuente.obtener();
            this.#cache = Array.isArray(crudos) ? crudos.map(this.#convertir) : [];
        }
        return [...this.#cache];
    }
}
