import { ElementoUI } from '../base/ElementoUI.js';

/**
 * Construye una fila del carrito. Si el servidor ya coticó la línea (`linea`),
 * se muestran su subtotal, su promoción y sus existencias; si no, la estimación local.
 */
export class FilaCarrito extends ElementoUI {
    #item;
    #carrito;
    #formateador;
    #linea;

    constructor({ item, carrito, formateador, linea = null, documento }) {
        super(documento);
        this.#item = item;
        this.#carrito = carrito;
        this.#formateador = formateador;
        this.#linea = linea;
    }

    renderizar() {
        const item = this.#item;
        const fila = this.crear('div', { clase: 'carrito-item' });

        const img = this.crear('img', { clase: 'carrito-item-img' });
        img.src = item.imagen;
        img.alt = item.nombre;

        fila.appendChild(img);
        fila.appendChild(this.#crearInfo());
        fila.appendChild(this.#crearPrecioUnitario());
        fila.appendChild(this.#crearControlCantidad());
        const subtotal = this.#linea ? this.#linea.subtotal : item.subtotal;
        fila.appendChild(this.crear('span', { clase: 'carrito-item-subtotal', texto: this.#formateador.formatear(subtotal) }));
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
        if (this.#linea?.promocion) {
            info.appendChild(this.crear('p', { clase: 'carrito-item-promo', texto: `Promoción: ${this.#linea.promocion}` }));
        }
        if (this.#linea && !this.#linea.disponible) {
            const quedan = this.#linea.stock;
            const texto = quedan > 0 ? `Solo quedan ${quedan} unidades.` : 'Agotado: quítalo del carrito.';
            info.appendChild(this.crear('p', { clase: 'carrito-item-sin-stock', texto }));
        }
        return info;
    }

    #crearPrecioUnitario() {
        const item = this.#item;
        const bloque = this.crear('span', { clase: 'carrito-item-precio-unitario' });
        if (item.precioFinal < item.precio) {
            bloque.appendChild(this.crear('s', { texto: this.#formateador.formatear(item.precio) }));
            bloque.appendChild(this.documento.createTextNode(' '));
        }
        bloque.appendChild(this.documento.createTextNode(this.#formateador.formatear(item.precioFinal)));
        return bloque;
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
