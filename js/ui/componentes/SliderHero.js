import { ComponenteUI } from '../base/ComponenteUI.js';

/**
 * Carrusel de la portada (antes: iniciarApp en main.js + renderizarProducto
 * en ui.js). Guarda su propio estado (lista e índice) en campos privados, en
 * lugar de las variables globales `listaProductos` y `currentIndex`.
 */
export class SliderHero extends ComponenteUI {
    #repositorio;
    #intervaloMs;
    #diapositivas = [];
    #indice = 0;
    #temporizador = null;
    #contenedor;
    #titulo;
    #imagen;

    constructor({ repositorio, intervaloMs = 5000, documento } = {}) {
        super(documento);
        this.#repositorio = repositorio;
        this.#intervaloMs = intervaloMs;
    }

    estaDisponible() {
        this.#contenedor = this.obtener('hero-container');
        this.#titulo = this.obtener('titulo-principal');
        this.#imagen = this.obtener('img-dinamica');
        return Boolean(this.#contenedor && this.#titulo && this.#imagen);
    }

    async alMontar() {
        try {
            this.#diapositivas = await this.#repositorio.obtenerTodos();
        } catch (error) {
            console.error('Fallo al cargar JSON', error);
            return;
        }
        if (this.#diapositivas.length === 0) return;

        this.mostrar(this.#diapositivas[0], 0);
        this.#temporizador = setInterval(() => this.siguiente(), this.#intervaloMs);
    }

    /** Diapositiva visible ahora (la usa el botón "Explora la colección"). */
    get diapositivaActual() {
        return this.#diapositivas[this.#indice] ?? null;
    }

    siguiente() {
        this.#indice = (this.#indice + 1) % this.#diapositivas.length;
        this.mostrar(this.#diapositivas[this.#indice], this.#indice);
    }

    mostrar(diapositiva, indice) {
        if (!this.#contenedor && !this.estaDisponible()) return;
        this.#contenedor.className = diapositiva.clase;
        this.#titulo.innerHTML = diapositiva.titulo;
        this.#imagen.src = diapositiva.imagen;
        this.documento.querySelectorAll('.punto').forEach((punto, i) => {
            punto.classList.toggle('active', i === indice);
        });
    }

    detener() {
        clearInterval(this.#temporizador);
        this.#temporizador = null;
    }
}
