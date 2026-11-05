import { ComponenteUI } from '../base/ComponenteUI.js';
import { RUTAS } from '../../config/Configuracion.js';

/**
 * Muestra u oculta los botones del menú según la sesión, muestra el enlace
 * "PANEL" solo al superadministrador y maneja "SALIR" cerrando la sesión en
 * el servidor. (Antes: inicializarSesion en user.js).
 */
export class NavegacionSesion extends ComponenteUI {
    #sesion;
    #autenticacion;
    #navegador;

    constructor({ sesion, autenticacion, navegador, documento }) {
        super(documento);
        this.#sesion = sesion;
        this.#autenticacion = autenticacion;
        this.#navegador = navegador;
    }

    async alMontar() {
        const autenticado = this.#sesion.estaAutenticado();
        const botonSalir = this.obtener('btn-logout');

        this.#mostrar(this.documento.querySelectorAll('.public-nav'), !autenticado);
        this.#mostrar(this.documento.querySelectorAll('.private-nav'), autenticado);
        if (botonSalir) {
            this.#mostrar([botonSalir], autenticado);
            botonSalir.addEventListener('click', async (evento) => {
                evento.preventDefault();
                await this.#autenticacion.cerrarSesion().catch(() => {});
                this.#navegador.irA(RUTAS.INICIO);
            });
        }

        if (autenticado) {
            const usuario = await this.#autenticacion.usuarioActual();
            this.#configurarEnlaceModulo(usuario?.rol);
            this.#configurarEnlacePerfil(usuario?.rol);
        }
    }

    /** El superadministrador ve PANEL; el vendedor, VENDEDOR; los clientes no ven ninguno. */
    #configurarEnlaceModulo(rol) {
        const destinos = {
            superadmin: { href: RUTAS.PANEL, texto: 'PANEL' },
            vendedor: { href: RUTAS.VENDEDOR, texto: 'VENDEDOR' }
        };
        const destino = destinos[rol];
        this.documento.querySelectorAll('.panel-admin').forEach(enlace => {
            if (destino) {
                enlace.setAttribute('href', destino.href);
                const titulo = enlace.querySelector('h2');
                if (titulo) titulo.textContent = destino.texto;
            }
            this.#mostrar([enlace], Boolean(destino));
        });
    }

    /** PERFIL: el cliente tiene su página; el personal lo abre en la sección "Mi perfil" de su panel. */
    #configurarEnlacePerfil(rol) {
        const destinos = {
            cliente: 'index_perfil.html',
            superadmin: 'index_admin.html#perfil',
            vendedor: 'index_vendedor.html#perfil'
        };
        const href = destinos[rol] ?? 'index_perfil.html';
        this.documento.querySelectorAll('.perfil-nav').forEach(enlace => enlace.setAttribute('href', href));
    }

    #mostrar(elementos, visible) {
        elementos.forEach(el => el.style.setProperty('display', visible ? 'flex' : 'none', 'important'));
    }
}
