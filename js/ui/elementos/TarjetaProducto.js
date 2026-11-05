import { ElementoUI } from '../base/ElementoUI.js';
import { alternarFavorito, esFavorito, hayFavoritos } from '../../comun/favoritos.js';

/**
 * Construye una tarjeta del catálogo. Muestra la promoción vigente, el precio
 * tachado cuando hay rebaja y el estado de existencias.
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
        if (p.agotado) card.classList.add('card-agotado');

        const img = this.crear('img', { clase: 'card-img' });
        img.src = p.imagen;
        img.alt = p.nombre;

        if (p.esPopular) card.appendChild(this.crear('span', { clase: 'card-badge', texto: 'POPULAR' }));
        if (p.tienePromocion) card.appendChild(this.crear('span', { clase: 'card-promo', texto: p.textoPromocion }));

        card.appendChild(img);
        card.appendChild(this.crear('h3', { clase: 'card-titulo', texto: p.nombre }));
        // Si no hay descripción se muestra la medida (mismo comportamiento anterior)
        card.appendChild(this.crear('p', { clase: 'card-descripcion', texto: p.descripcion || p.medida || '' }));
        card.appendChild(this.#crearPrecio());
        card.appendChild(this.crear('span', { clase: 'card-medida', texto: p.medida || '' }));
        card.appendChild(this.#crearBoton());
        if (hayFavoritos()) card.appendChild(this.#crearGuardar());

        card.addEventListener('click', () => this.#alSeleccionar(p));
        return card;
    }

    #crearPrecio() {
        const p = this.#producto;
        const bloque = this.crear('div', { clase: 'card-precios' });
        if (p.precioFinal < p.precio) {
            bloque.appendChild(this.crear('s', { clase: 'card-precio-anterior', texto: this.#formateador.formatear(p.precio) }));
        }
        bloque.appendChild(this.crear('span', { clase: 'card-precio', texto: this.#formateador.formatear(p.precioFinal) }));
        return bloque;
    }

    #crearBoton() {
        const boton = this.crear('button', { clase: 'card-boton', texto: 'Agregar al carrito' });
        if (this.#producto.agotado) {
            boton.textContent = 'Agotado';
            boton.disabled = true;
            return boton;
        }
        if (this.#carrito.existe(this.#producto.id)) this.#marcarAgregado(boton);

        boton.addEventListener('click', (evento) => {
            evento.stopPropagation();
            this.#carrito.agregar(this.#producto);
            this.#marcarAgregado(boton);
        });
        return boton;
    }

    #crearGuardar() {
        const boton = this.crear('button', { clase: 'card-guardar' });
        const pintar = () => {
            const guardado = esFavorito(this.#producto.id);
            boton.textContent = guardado ? '♥ Guardado' : '♡ Guardar';
            boton.classList.toggle('guardado', guardado);
        };
        pintar();
        boton.addEventListener('click', async (evento) => {
            evento.stopPropagation();
            boton.disabled = true;
            try {
                await alternarFavorito(this.#producto.id);
            } finally {
                boton.disabled = false;
                pintar();
            }
        });
        return boton;
    }

    #marcarAgregado(boton) {
        boton.textContent = 'Agregado';
        boton.classList.add('agregado');
        boton.disabled = true;
    }
}
