import { ComponenteUI } from '../base/ComponenteUI.js';
import { TarjetaProducto } from '../elementos/TarjetaProducto.js';

/**
 * Sección de tarjetas del catálogo (antes: cargarTarjetas + renderizarTarjetas).
 * SOLID - S: solo carga y dibuja; filtrar es tarea de BuscadorCatalogo.
 */
export class CatalogoTarjetas extends ComponenteUI {
    #repositorio;
    #carrito;
    #formateador;
    #alSeleccionar;
    #productos = [];
    #contenedor;

    constructor({ repositorio, carrito, formateador, alSeleccionar, documento }) {
        super(documento);
        this.#repositorio = repositorio;
        this.#carrito = carrito;
        this.#formateador = formateador;
        this.#alSeleccionar = alSeleccionar;
    }

    estaDisponible() {
        this.#contenedor = this.obtener('seccion-tarjetas');
        return Boolean(this.#contenedor);
    }

    async alMontar() {
        try {
            this.#productos = await this.#repositorio.obtenerTodos();
            this.renderizar(this.#productos);
        } catch (error) {
            console.error('Error al cargar tarjetas:', error);
        }
    }

    /** Copia de la lista completa (para que el buscador filtre sobre ella). */
    get productos() {
        return [...this.#productos];
    }

    renderizar(lista) {
        if (!this.#contenedor && !this.estaDisponible()) return;
        this.#contenedor.innerHTML = '';
        lista.forEach(producto => {
            const tarjeta = new TarjetaProducto({
                producto,
                carrito: this.#carrito,
                formateador: this.#formateador,
                alSeleccionar: this.#alSeleccionar,
                documento: this.documento
            });
            this.#contenedor.appendChild(tarjeta.renderizar());
        });
    }
}
