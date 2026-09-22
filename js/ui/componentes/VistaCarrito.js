import { ComponenteUI } from '../base/ComponenteUI.js';
import { FilaCarrito } from '../elementos/FilaCarrito.js';
import { CarritoServicio } from '../../servicios/CarritoServicio.js';

/**
 * Página del carrito (antes: inicializarCarrito + actualizarVistaCarrito).
 * Se suscribe al servicio: cada vez que el carrito cambia, se redibuja sola.
 */
export class VistaCarrito extends ComponenteUI {
    #carrito;
    #formateador;
    #contenedor;
    #total;

    constructor({ carrito, formateador, documento }) {
        super(documento);
        this.#carrito = carrito;
        this.#formateador = formateador;
    }

    estaDisponible() {
        this.#contenedor = this.obtener('carrito-items');
        this.#total = this.obtener('carrito-total');
        return Boolean(this.#contenedor && this.#total);
    }

    alMontar() {
        this.#carrito.suscribir(CarritoServicio.EVENTO_CAMBIO, () => this.actualizar());
        this.actualizar();
    }

    actualizar() {
        const items = this.#carrito.obtenerItems();
        this.#contenedor.innerHTML = '';

        if (items.length === 0) {
            this.#contenedor.appendChild(this.crear('p', { clase: 'carrito-vacio', texto: 'Tu carrito está vacío' }));
        } else {
            items.forEach(item => {
                const fila = new FilaCarrito({ item, carrito: this.#carrito, formateador: this.#formateador, documento: this.documento });
                this.#contenedor.appendChild(fila.renderizar());
            });
        }
        this.#total.textContent = this.#formateador.formatearTotal(this.#carrito.calcularTotal());
    }
}
