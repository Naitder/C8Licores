import { ReglaValidacion } from './ReglaValidacion.js';

/** El correo no debe estar registrado todavía. */
export class ReglaEmailDisponible extends ReglaValidacion {
    #repositorio;

    constructor(repositorioUsuarios, mensaje) {
        super(mensaje);
        this.#repositorio = repositorioUsuarios;
    }

    esValido(datos) {
        return !this.#repositorio.existeEmail(datos.email);
    }
}
