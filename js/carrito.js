/**
 * CAPA DE COMPATIBILIDAD (reemplazable).
 * Nuevo equivalente: js/servicios/CarritoServicio.js
 */
import { ContenedorDependencias } from './app/ContenedorDependencias.js';

const carrito = () => ContenedorDependencias.obtener().carrito;

/** @deprecated usar carrito.agregar(producto) */
export function agregarProducto(producto) {
    carrito().agregar(producto);
}

/** @deprecated usar carrito.incrementar(id) */
export function incrementarCantidad(id) {
    carrito().incrementar(id);
}

/** @deprecated usar carrito.decrementar(id) */
export function decrementarCantidad(id) {
    carrito().decrementar(id);
}

/** @deprecated usar carrito.eliminar(id) */
export function eliminarProducto(id) {
    carrito().eliminar(id);
}

/** @deprecated usar carrito.obtenerItems() (devuelve objetos ItemCarrito) */
export function obtenerCarrito() {
    return carrito().obtenerItems().map(item => item.aJSON());
}

/** @deprecated usar carrito.vaciar() */
export function vaciarCarrito() {
    carrito().vaciar();
}

/** @deprecated usar carrito.existe(id) */
export function existeProducto(id) {
    return carrito().existe(id);
}
