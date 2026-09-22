/**
 * Elemento del slider de la página principal (json/productos.json).
 */
export class Diapositiva {
    #titulo;
    #imagen;
    #clase;

    constructor({ titulo = '', imagen = '', clase = '' }) {
        this.#titulo = titulo;
        this.#imagen = imagen;
        this.#clase = clase;
    }

    static desdeJSON(datos = {}) {
        return new Diapositiva(datos);
    }

    /**
     * Extrae la primera palabra limpia de un título con HTML.
     * "BUCHANA'S <br> <span>DELUXE</span>" -> "buchanas".
     * Es la lógica de `tituloSucio` que estaba suelta en main.js.
     */
    static extraerPalabraClave(tituloHTML = '') {
        return tituloHTML
            .replace(/<[^>]*>/g, ' ')
            .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g, '')
            .trim()
            .split(' ')[0]
            .toLowerCase();
    }

    get titulo() { return this.#titulo; }
    get imagen() { return this.#imagen; }
    get clase() { return this.#clase; }

    palabraClave() {
        return Diapositiva.extraerPalabraClave(this.#titulo);
    }
}
