import { FormularioBase } from './FormularioBase.js';

/** Formulario de creación de cuenta (antes: inicializarRegistro). */
export class FormularioRegistro extends FormularioBase {
    #autenticacion;

    constructor({ autenticacion, filtros, navegador, documento }) {
        super({ idFormulario: 'register-form', filtros, navegador, documento });
        this.#autenticacion = autenticacion;
    }

    procesar() {
        const resultado = this.#autenticacion.registrar({
            name: this.valor('reg-name'),
            email: this.valor('reg-email'),
            password: this.valor('reg-password'),
            confirmPassword: this.valor('reg-confirm')
        });
        if (resultado.esExito) {
            this.redirigirTrasAutenticacion();
        } else {
            this.mostrarError(resultado.mensaje);
        }
    }
}
