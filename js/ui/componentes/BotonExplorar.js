import { ComponenteUI } from '../base/ComponenteUI.js';
import { Diapositiva } from '../../modelos/Diapositiva.js';
import { RUTAS } from '../../config/Configuracion.js';

/**
 * Botón "Explora la colección" (antes: bloque anónimo dentro de main.js).
 * Lleva al catálogo filtrado por el producto visible; si no hay sesión,
 * guarda el filtro como pendiente y envía al login.
 */
export class BotonExplorar extends ComponenteUI {
    #slider;
    #sesion;
    #filtros;
    #navegador;
    #boton;

    constructor({ slider, sesion, filtros, navegador, documento }) {
        super(documento);
        this.#slider = slider;
        this.#sesion = sesion;
        this.#filtros = filtros;
        this.#navegador = navegador;
    }

    estaDisponible() {
        this.#boton = this.obtener('btn-accion');
        return Boolean(this.#boton);
    }

    alMontar() {
        this.#boton.addEventListener('click', () => this.explorar());
    }

    /** Término a buscar: el de la diapositiva visible o, si aún no cargó, el del título. */
    terminoActual() {
        const actual = this.#slider?.diapositivaActual;
        if (actual) return actual.palabraClave();
        const titulo = this.obtener('titulo-principal');
        return titulo ? Diapositiva.extraerPalabraClave(titulo.innerHTML) : '';
    }

    explorar() {
        const termino = this.terminoActual();
        if (this.#sesion.estaAutenticado()) {
            this.#filtros.guardar(termino);
            this.#navegador.irA(RUTAS.PRODUCTOS);
        } else {
            this.#filtros.guardarPendiente(termino);
            this.#navegador.irA(RUTAS.LOGIN);
        }
    }
}
