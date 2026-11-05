import { ComponenteUI } from '../base/ComponenteUI.js';

/** Menú desplegable en móviles (antes: inicializarMenuHamburguesa). */
export class MenuHamburguesa extends ComponenteUI {
    static CLASE_ACTIVA = 'activo';

    #boton;
    #menu;

    estaDisponible() {
        this.#boton = this.obtener('menu-toggle');
        this.#menu = this.obtener('nav-botones');
        return Boolean(this.#boton && this.#menu);
    }

    alMontar() {
        this.#boton.addEventListener('click', (evento) => {
            evento.stopPropagation();
            this.alternar();
        });

        this.documento.querySelectorAll('.nav-botones a').forEach(enlace => {
            enlace.addEventListener('click', () => this.cerrar());
        });

        this.documento.addEventListener('click', (evento) => {
            if (!this.#menu.contains(evento.target) && evento.target !== this.#boton) this.cerrar();
        });
    }

    alternar() {
        this.#menu.classList.toggle(MenuHamburguesa.CLASE_ACTIVA);
    }

    cerrar() {
        this.#menu.classList.remove(MenuHamburguesa.CLASE_ACTIVA);
    }
}
