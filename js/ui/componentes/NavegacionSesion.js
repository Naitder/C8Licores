import { ComponenteUI } from '../base/ComponenteUI.js';
import { RUTAS } from '../../config/Configuracion.js';

/**
 * Muestra u oculta los botones del menú según la sesión y maneja "SALIR".
 * (Antes: inicializarSesion en user.js).
 */
export class NavegacionSesion extends ComponenteUI {
    #sesion;
    #navegador;

    constructor({ sesion, navegador, documento }) {
        super(documento);
        this.#sesion = sesion;
        this.#navegador = navegador;
    }

    alMontar() {
        const autenticado = this.#sesion.estaAutenticado();
        const botonSalir = this.obtener('btn-logout');

        this.#mostrar(this.documento.querySelectorAll('.public-nav'), !autenticado);
        this.#mostrar(this.documento.querySelectorAll('.private-nav'), autenticado);
        if (botonSalir) {
            this.#mostrar([botonSalir], autenticado);
            botonSalir.addEventListener('click', (evento) => {
                evento.preventDefault();
                this.#sesion.cerrar();
                this.#navegador.irA(RUTAS.INICIO);
            });
        }
    }

    #mostrar(elementos, visible) {
        elementos.forEach(el => el.style.setProperty('display', visible ? 'flex' : 'none', 'important'));
    }
}
