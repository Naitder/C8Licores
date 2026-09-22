import { ElementoUI } from '../base/ElementoUI.js';

/**
 * Construye una tarjeta del catálogo (antes: el interior del forEach de
 * renderizarTarjetas en ui.js). Usa exactamente las mismas clases CSS.
 */
export class TarjetaProducto extends ElementoUI {
    #producto;
    #carrito;
    #formateador;
    #alSeleccionar;

    /**
     * @param {object} opciones
     * @param {import('../../modelos/Producto.js').Producto} opciones.producto
     * @param {import('../../servicios/CarritoServicio.js').CarritoServicio} opciones.carrito
     * @param {import('../../core/FormateadorPrecio.js').FormateadorPrecio} opciones.formateador
     * @param {(producto) => void} [opciones.alSeleccionar] acción al hacer clic en la tarjeta
     */
    constructor({ producto, carrito, formateador, alSeleccionar = () => {}, documento }) {
        super(documento);
        this.#producto = producto;
        this.#carrito = carrito;
        this.#formateador = formateador;
        this.#alSeleccionar = alSeleccionar;
    }

    renderizar() {
        const p = this.#producto;
        const card = this.crear('div', { clase: 'card' });
        if (p.esPopular) card.classList.add('card-popular');

        const img = this.crear('img', { clase: 'card-img' });
        img.src = p.imagen;
        img.alt = p.nombre;

        if (p.esPopular) card.appendChild(this.crear('span', { clase: 'card-badge', texto: 'POPULAR' }));

        card.appendChild(img);
        card.appendChild(this.crear('h3', { clase: 'card-titulo', texto: p.nombre }));
        // Si no hay descripción se muestra la medida (mismo comportamiento anterior)
        card.appendChild(this.crear('p', { clase: 'card-descripcion', texto: p.descripcion || p.medida || '' }));
        card.appendChild(this.crear('span', { clase: 'card-precio', texto: this.#formateador.formatear(p.precio) }));
        card.appendChild(this.crear('span', { clase: 'card-medida', texto: p.medida || '' }));
        card.appendChild(this.#crearBoton());

        card.addEventListener('click', () => this.#alSeleccionar(p));
        return card;
    }

    #crearBoton() {
        const boton = this.crear('button', { clase: 'card-boton', texto: 'Agregar al carrito' });
        if (this.#carrito.existe(this.#producto.id)) this.#marcarAgregado(boton);

        boton.addEventListener('click', (evento) => {
            evento.stopPropagation();
            this.#carrito.agregar(this.#producto);
            this.#marcarAgregado(boton);
        });
        return boton;
    }

    #marcarAgregado(boton) {
        boton.textContent = 'Agregado';
        boton.classList.add('agregado');
        boton.disabled = true;
    }
}
