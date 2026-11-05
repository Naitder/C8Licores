import { ComponenteUI } from '../base/ComponenteUI.js';
import { RUTAS } from '../../config/Configuracion.js';
import { montarPerfil } from '../../comun/perfil.js';

/** Página "Mi perfil" del cliente (index_perfil.html). */
export class PaginaPerfil extends ComponenteUI {
    #sesion;
    #navegador;
    #contenedor;

    constructor({ sesion, navegador, documento }) {
        super(documento);
        this.#sesion = sesion;
        this.#navegador = navegador;
    }

    estaDisponible() {
        this.#contenedor = this.obtener('perfil-contenido');
        return Boolean(this.#contenedor);
    }

    async alMontar() {
        if (!this.#sesion.estaAutenticado()) {
            this.#navegador.irA(RUTAS.LOGIN);
            return;
        }
        await montarPerfil(this.#contenedor);
    }
}
