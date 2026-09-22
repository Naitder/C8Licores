import { EmisorEventos } from '../core/EmisorEventos.js';
import { ItemCarrito } from '../modelos/ItemCarrito.js';
import { Producto } from '../modelos/Producto.js';
import { CLAVES } from '../config/Configuracion.js';

/**
 * Lógica del carrito de compras (antes: carrito.js con variables globales).
 *
 * - Encapsulamiento: la lista `#items` es privada; hacia afuera solo se
 *   entrega una copia, así nadie la modifica sin pasar por los métodos.
 * - Herencia: extiende EmisorEventos y emite 'cambio' en cada modificación,
 *   de modo que la vista se actualiza sola.
 * - D (Inversión de dependencias): recibe el almacenamiento por constructor.
 */
export class CarritoServicio extends EmisorEventos {
    static EVENTO_CAMBIO = 'cambio';

    #almacenamiento;
    #clave;
    #items = [];

    constructor(almacenamiento, clave = CLAVES.CARRITO) {
        super();
        this.#almacenamiento = almacenamiento;
        this.#clave = clave;
        this.#cargar();
    }

    #cargar() {
        const datos = this.#almacenamiento.leerJSON(this.#clave, []);
        this.#items = Array.isArray(datos) ? datos.map(dato => ItemCarrito.desdeJSON(dato)) : [];
    }

    #guardar() {
        this.#almacenamiento.escribirJSON(this.#clave, this.#items.map(item => item.aJSON()));
        this.emitir(CarritoServicio.EVENTO_CAMBIO, this.obtenerItems());
    }

    #buscar(id) {
        return this.#items.find(item => item.id === id);
    }

    /** @returns {boolean} true si se agregó; false si ya estaba. */
    agregar(producto) {
        const entidad = producto instanceof Producto ? producto : Producto.desdeJSON(producto);
        if (this.existe(entidad.id)) return false;
        this.#items.push(ItemCarrito.desdeProducto(entidad));
        this.#guardar();
        return true;
    }

    incrementar(id) {
        const item = this.#buscar(id);
        if (!item) return;
        item.incrementar();
        this.#guardar();
    }

    /** Resta una unidad; si llega a cero, elimina el producto. */
    decrementar(id) {
        const item = this.#buscar(id);
        if (!item) return;
        if (!item.decrementar()) {
            this.#items = this.#items.filter(actual => actual.id !== id);
        }
        this.#guardar();
    }

    eliminar(id) {
        this.#items = this.#items.filter(item => item.id !== id);
        this.#guardar();
    }

    vaciar() {
        this.#items = [];
        this.#guardar();
    }

    existe(id) {
        return this.#items.some(item => item.id === id);
    }

    obtenerItems() {
        return [...this.#items];
    }

    calcularTotal() {
        return this.#items.reduce((total, item) => total + item.subtotal, 0);
    }

    get cantidadProductos() {
        return this.#items.length;
    }
}
