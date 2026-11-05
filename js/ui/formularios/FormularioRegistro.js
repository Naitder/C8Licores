import { FormularioBase } from './FormularioBase.js';

/** Formulario de creación de cuenta. Se registra en el servidor (antes: inicializarRegistro). */
export class FormularioRegistro extends FormularioBase {
    #autenticacion;

    constructor({ autenticacion, filtros, navegador, documento }) {
        super({ idFormulario: 'register-form', filtros, navegador, documento });
        this.#autenticacion = autenticacion;
    }

    async procesar() {
        try {
            await this.#autenticacion.registrar({
                nombre: this.valor('reg-name'),
                email: this.valor('reg-email'),
                password: this.valor('reg-password'),
                confirmPassword: this.valor('reg-confirm'),
                fechaNacimiento: this.valor('reg-nacimiento'),
                identificacion: this.valor('reg-cedula')
            });
            this.redirigirTrasAutenticacion();
        } catch (error) {
            this.mostrarError(error.message);
        }
    }
}
