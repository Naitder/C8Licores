/**
 * CAPA DE COMPATIBILIDAD (reemplazable).
 * Nuevo equivalente: js/ui/componentes/VistaCarrito.js + js/ui/elementos/FilaCarrito.js
 */
import { ContenedorDependencias } from './app/ContenedorDependencias.js';
import { VistaCarrito } from './ui/componentes/VistaCarrito.js';

/** @deprecated usar new VistaCarrito({...}).montar() */
export function inicializarCarrito() {
    const d = ContenedorDependencias.obtener();
    new VistaCarrito({ carrito: d.carrito, formateador: d.formateador, documento: d.documento }).montar();
}
