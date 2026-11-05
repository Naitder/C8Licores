import { CLAVES } from '../config/Configuracion.js';

/**
 * Administra el término de búsqueda que viaja entre páginas:
 * "Explora la colección" -> (login) -> catálogo ya filtrado.
 */
export class FiltroServicio {
    #almacenamiento;

    constructor(almacenamiento) {
        this.#almacenamiento = almacenamiento;
    }

    /** Filtro para aplicar de inmediato (usuario con sesión). */
    guardar(termino) {
        if (termino) this.#almacenamiento.escribir(CLAVES.FILTRO, termino);
    }

    /** Filtro en espera hasta que el usuario inicie sesión. */
    guardarPendiente(termino) {
        if (termino) this.#almacenamiento.escribir(CLAVES.FILTRO_PENDIENTE, termino);
    }

    /** Convierte el filtro pendiente en activo. @returns {boolean} si existía */
    promoverPendiente() {
        const pendiente = this.#almacenamiento.leer(CLAVES.FILTRO_PENDIENTE);
        if (!pendiente) return false;
        this.#almacenamiento.escribir(CLAVES.FILTRO, pendiente);
        this.#almacenamiento.eliminar(CLAVES.FILTRO_PENDIENTE);
        return true;
    }

    /** Lee el filtro (activo o pendiente) y lo borra. @returns {string|null} */
    consumir() {
        const termino = this.#almacenamiento.leer(CLAVES.FILTRO) || this.#almacenamiento.leer(CLAVES.FILTRO_PENDIENTE);
        this.#almacenamiento.eliminar(CLAVES.FILTRO);
        this.#almacenamiento.eliminar(CLAVES.FILTRO_PENDIENTE);
        return termino || null;
    }
}
