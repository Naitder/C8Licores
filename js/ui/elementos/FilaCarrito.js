import { ElementoUI } from '../base/ElementoUI.js';

/**
 * Construye una fila del carrito (antes: crearItemCarrito en carritoUI.js).
 * Ya no llama a "actualizarVistaCarrito": solo informa al servicio, y el
 * servicio avisa a la vista mediante eventos.
 */
export class FilaCarrito extends ElementoUI {
    #item;
    #carrito;
    #formateador;

    constructor({ item, carrito, formateador, documento }) {
        super(documento);
        this.#item = item;
        this.#carrito = carrito;
        this.#formateador = formateador;
    }

    renderizar() {
        const item = this.#item;
        const fila = this.crear('div', { clase: 'carrito-item' });

        const img = this.crear('img', { clase: 'carrito-item-img' });
        img.src = item.imagen;
        img.alt = item.nombre;

        fila.appendChild(img);
        fila.appendChild(this.#crearInfo());
        fila.appendChild(this.crear('span', { clase: 'carrito-item-precio-unitario', texto: this.#formateador.formatear(item.precio) }));
        fila.appendChild(this.#crearControlCantidad());
        fila.appendChild(this.crear('span', { clase: 'carrito-item-subtotal', texto: this.#formateador.formatear(item.subtotal) }));
        fila.appendChild(this.#crearBoton('Eliminar', 'btn-eliminar', () => this.#carrito.eliminar(item.id)));
        return fila;
    }

    #crearInfo() {
        const info = this.crear('div', { clase: 'carrito-item-info' });
        info.appendChild(this.crear('h3', { clase: 'carrito-item-titulo', texto: this.#item.nombre }));
        if (this.#item.descripcion) {
            info.appendChild(this.crear('p', { clase: 'carrito-item-descripcion', texto: this.#item.descripcion }));
        }
        info.appendChild(this.crear('span', { clase: 'carrito-item-medida', texto: this.#item.medida || '' }));
        return info;
    }

    #crearControlCantidad() {
        const id = this.#item.id;
        const control = this.crear('div', { clase: 'carrito-item-cantidad' });
        control.appendChild(this.#crearBoton('−', 'btn-cantidad', () => this.#carrito.decrementar(id)));
        control.appendChild(this.crear('span', { clase: 'cantidad-numero', texto: this.#item.cantidad }));
        control.appendChild(this.#crearBoton('+', 'btn-cantidad', () => this.#carrito.incrementar(id)));
        return control;
    }

    /** Reutilizado para "−", "+" y "Eliminar" (antes eran 3 bloques casi iguales). */
    #crearBoton(texto, clase, accion) {
        const boton = this.crear('button', { clase, texto });
        boton.addEventListener('click', accion);
        return boton;
    }
}
