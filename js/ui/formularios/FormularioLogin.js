import { FormularioBase } from './FormularioBase.js';
import { RUTAS } from '../../config/Configuracion.js';

/** Formulario de inicio de sesión. Valida contra el servidor (antes: inicializarLogin). */
export class FormularioLogin extends FormularioBase {
    #autenticacion;

    constructor({ autenticacion, filtros, navegador, documento }) {
        super({ idFormulario: 'login-form', filtros, navegador, documento });
        this.#autenticacion = autenticacion;
    }

    async procesar() {
        try {
            const usuario = await this.#autenticacion.iniciarSesion(this.valor('login-email'), this.valor('login-password'));
            // Cada rol entra a su módulo: el administrador al panel, el vendedor a su
            // módulo de ventas; los clientes, a la tienda.
            const destino = { superadmin: RUTAS.PANEL, vendedor: RUTAS.VENDEDOR }[usuario.rol] ?? null;
            this.redirigirTrasAutenticacion(destino);
        } catch (error) {
            this.mostrarError(error.message);
        }
    }
}
