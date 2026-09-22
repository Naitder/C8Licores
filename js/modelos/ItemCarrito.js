import { Producto } from './Producto.js';

/**
 * Subclase de Producto: un producto dentro del carrito, con cantidad.
 * Herencia: reutiliza todos los atributos de Producto y añade su propio estado.
 */
export class ItemCarrito extends Producto {
    #cantidad;

    constructor(datos, cantidad = 1) {
        super(datos);
        this.#cantidad = Math.max(1, Number(cantidad) || 1);
    }

    /** Sobrescribe la fábrica del padre para leer también la cantidad. */
    static desdeJSON(datos = {}) {
        return new ItemCarrito({ ...datos, nombre: datos.titulo || datos.nombre || '' }, datos.cantidad);
    }

    static desdeProducto(producto, cantidad = 1) {
        return new ItemCarrito(producto.aJSON(), cantidad);
    }

    get cantidad() { return this.#cantidad; }
    get subtotal() { return this.precio * this.#cantidad; }

    incrementar() {
        this.#cantidad += 1;
    }

    /** @returns {boolean} true si todavía queda al menos una unidad */
    decrementar() {
        this.#cantidad -= 1;
        return this.#cantidad > 0;
    }

    /** Polimorfismo: extiende la serialización del padre. */
    aJSON() {
        return { ...super.aJSON(), cantidad: this.#cantidad };
    }
}
