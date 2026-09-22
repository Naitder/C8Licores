import { ComponenteUI } from '../base/ComponenteUI.js';

/**
 * Caja de búsqueda del catálogo (antes: inicializarBuscador).
 * Depende de la abstracción EstrategiaBusqueda, no del algoritmo concreto.
 */
export class BuscadorCatalogo extends ComponenteUI {
    #catalogo;
    #estrategia;
    #filtros;
    #entrada;

    /**
     * @param {object} opciones
     * @param {import('./CatalogoTarjetas.js').CatalogoTarjetas} opciones.catalogo
     * @param {import('../../busqueda/EstrategiaBusqueda.js').EstrategiaBusqueda} opciones.estrategia
     * @param {import('../../servicios/FiltroServicio.js').FiltroServicio} opciones.filtros
     */
    constructor({ catalogo, estrategia, filtros, documento }) {
        super(documento);
        this.#catalogo = catalogo;
        this.#estrategia = estrategia;
        this.#filtros = filtros;
    }

    estaDisponible() {
        this.#entrada = this.obtener('buscador');
        return Boolean(this.#entrada);
    }

    alMontar() {
        const filtroGuardado = this.#filtros.consumir();
        if (filtroGuardado) {
            this.#entrada.value = filtroGuardado;
            this.buscar(filtroGuardado);
        }
        this.#entrada.addEventListener('input', () => this.buscar(this.#entrada.value));
    }

    buscar(texto) {
        const termino = String(texto).trim().toLowerCase();
        const todos = this.#catalogo.productos;
        this.#catalogo.renderizar(termino === '' ? todos : this.#estrategia.filtrar(todos, termino));
    }
}
