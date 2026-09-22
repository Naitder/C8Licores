import { FormularioBase } from './FormularioBase.js';

/** Formulario de inicio de sesión (antes: inicializarLogin). */
export class FormularioLogin extends FormularioBase {
    #autenticacion;

    constructor({ autenticacion, filtros, navegador, documento }) {
        super({ idFormulario: 'login-form', filtros, navegador, documento });
        this.#autenticacion = autenticacion;
    }

    procesar() {
        const resultado = this.#autenticacion.iniciarSesion(this.valor('login-email'), this.valor('login-password'));
        if (resultado.esExito) {
            this.redirigirTrasAutenticacion();
        } else {
            this.mostrarError(resultado.mensaje);
        }
    }
}
