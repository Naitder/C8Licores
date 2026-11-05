import { Sesion } from '../modelos/Sesion.js';
import { CLAVES } from '../config/Configuracion.js';

/**
 * Lee, crea y cierra la sesión.
 * Antes la lectura de "session_barrilete" estaba duplicada (con dos
 * implementaciones distintas) en main.js y en user.js.
 */
export class SesionServicio {
    #almacenamiento;
    #clave;

    constructor(almacenamiento, clave = CLAVES.SESION) {
        this.#almacenamiento = almacenamiento;
        this.#clave = clave;
    }

    obtener() {
        return Sesion.desdeJSON(this.#almacenamiento.leerJSON(this.#clave, null));
    }

    estaAutenticado() {
        return this.obtener().estaActiva;
    }

    iniciar(usuario) {
        this.#almacenamiento.escribirJSON(this.#clave, Sesion.paraUsuario(usuario).aJSON());
    }

    cerrar() {
        this.#almacenamiento.eliminar(this.#clave);
    }
}
