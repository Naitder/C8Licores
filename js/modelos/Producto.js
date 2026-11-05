/**
 * Entidad Producto del catálogo.
 * Encapsulamiento: los atributos son privados (#) y solo se leen con getters,
 * así ninguna parte del código puede alterar un precio o un id por error.
 *
 * Los datos de precio, promoción y existencias vienen del servidor
 * (/api/productos); el precio final lo calcula el servidor, no el navegador.
 */
export class Producto {
    #id;
    #nombre;
    #descripcion;
    #imagen;
    #precio;
    #precioFinal;
    #promocion;
    #medida;
    #popular;
    #stock;

    constructor({
        id, nombre = '', descripcion = '', imagen = '', precio = 0,
        precioFinal = null, promocion = null, medida = '', popular = false, stock = null
    }) {
        this.#id = id;
        this.#nombre = nombre;
        this.#descripcion = descripcion;
        this.#imagen = imagen;
        this.#precio = Number(precio) || 0;
        this.#precioFinal = precioFinal === null || precioFinal === undefined
            ? this.#precio
            : Number(precioFinal) || 0;
        this.#promocion = promocion ?? null;
        this.#medida = medida;
        this.#popular = Boolean(popular);
        this.#stock = stock === null || stock === undefined ? null : Number(stock);
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
    get precioFinal() { return this.#precioFinal; }
    get medida() { return this.#medida; }
    get esPopular() { return this.#popular; }
    get stock() { return this.#stock; }

    /** Texto de la promoción vigente ("2x1", "25% de descuento"...) o '' si no hay. */
    get textoPromocion() { return this.#promocion?.texto ?? ''; }

    /** Hay promoción si el precio baja o si es NxM (que no cambia el precio unitario). */
    get tienePromocion() {
        return this.#promocion !== null;
    }

    /** Un producto sin existencias se muestra, pero no se puede comprar. */
    get agotado() {
        return this.#stock !== null && this.#stock <= 0;
    }

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
            precioFinal: this.#precioFinal,
            promocion: this.#promocion,
            medida: this.#medida,
            popular: this.#popular,
            stock: this.#stock
        };
    }
}
