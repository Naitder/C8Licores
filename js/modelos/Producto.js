/**
 * Entidad Producto del catálogo.
 * Encapsulamiento: los atributos son privados (#) y solo se leen con getters,
 * así ninguna parte del código puede alterar un precio o un id por error.
 *
 * También unifica el viejo `producto.titulo || producto.nombre`, que estaba
 * repetido en ui.js, carritoUI.js y buscadorUtils.js.
 */
export class Producto {
    #id;
    #nombre;
    #descripcion;
    #imagen;
    #precio;
    #medida;
    #popular;

    constructor({ id, nombre = '', descripcion = '', imagen = '', precio = 0, medida = '', popular = false }) {
        this.#id = id;
        this.#nombre = nombre;
        this.#descripcion = descripcion;
        this.#imagen = imagen;
        this.#precio = Number(precio) || 0;
        this.#medida = medida;
        this.#popular = Boolean(popular);
    }

    /** Fábrica: acepta tanto `titulo` como `nombre` (el JSON trae ambos casos). */
    static desdeJSON(datos = {}) {
        return new Producto({ ...datos, nombre: datos.titulo || datos.nombre || '' });
    }

    get id() { return this.#id; }
    get nombre() { return this.#nombre; }
    get descripcion() { return this.#descripcion; }
    get imagen() { return this.#imagen; }
    get precio() { return this.#precio; }
    get medida() { return this.#medida; }
    get esPopular() { return this.#popular; }

    /**
     * Objeto plano para guardar en localStorage.
     * Conserva `titulo` y `nombre` para que los carritos guardados con la
     * versión anterior sigan funcionando.
     */
    aJSON() {
        return {
            id: this.#id,
            titulo: this.#nombre,
            nombre: this.#nombre,
            descripcion: this.#descripcion,
            imagen: this.#imagen,
            precio: this.#precio,
            medida: this.#medida,
            popular: this.#popular
        };
    }
}
