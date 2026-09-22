import { ContenedorDependencias } from './ContenedorDependencias.js';
import { NavegacionSesion } from '../ui/componentes/NavegacionSesion.js';
import { MenuHamburguesa } from '../ui/componentes/MenuHamburguesa.js';
import { SliderHero } from '../ui/componentes/SliderHero.js';
import { BotonExplorar } from '../ui/componentes/BotonExplorar.js';
import { CatalogoTarjetas } from '../ui/componentes/CatalogoTarjetas.js';
import { BuscadorCatalogo } from '../ui/componentes/BuscadorCatalogo.js';
import { VistaCarrito } from '../ui/componentes/VistaCarrito.js';
import { FormularioLogin } from '../ui/formularios/FormularioLogin.js';
import { FormularioRegistro } from '../ui/formularios/FormularioRegistro.js';
import { PARAMETROS } from '../config/Configuracion.js';

/**
 * Arranque de la aplicación. Crea los componentes y los monta; cada
 * componente decide por sí mismo si aplica a la página actual
 * (por eso todas las páginas pueden seguir cargando el mismo main.js).
 */
export class Aplicacion {
    #d;

    constructor(dependencias = ContenedorDependencias.obtener()) {
        this.#d = dependencias;
    }

    async iniciar() {
        const d = this.#d;
        const comunes = { documento: d.documento };

        const slider = new SliderHero({ repositorio: d.repositorioDiapositivas, intervaloMs: PARAMETROS.INTERVALO_SLIDER_MS, ...comunes });
        const catalogo = new CatalogoTarjetas({
            repositorio: d.repositorioCatalogo,
            carrito: d.carrito,
            formateador: d.formateador,
            alSeleccionar: (producto) => this.mostrarDetalle(producto),
            ...comunes
        });

        const componentesSincronos = [
            new NavegacionSesion({ sesion: d.sesion, navegador: d.navegador, ...comunes }),
            new FormularioLogin({ autenticacion: d.autenticacion, filtros: d.filtros, navegador: d.navegador, ...comunes }),
            new FormularioRegistro({ autenticacion: d.autenticacion, filtros: d.filtros, navegador: d.navegador, ...comunes }),
            new MenuHamburguesa(d.documento),
            new VistaCarrito({ carrito: d.carrito, formateador: d.formateador, ...comunes }),
            new BotonExplorar({ slider, sesion: d.sesion, filtros: d.filtros, navegador: d.navegador, ...comunes })
        ];

        await Promise.all([
            ...componentesSincronos.map(componente => componente.montar()),
            slider.montar(),
            catalogo.montar().then(montado => {
                if (!montado) return false;
                return new BuscadorCatalogo({ catalogo, estrategia: d.estrategiaBusqueda, filtros: d.filtros, ...comunes }).montar();
            })
        ]);
    }

    /**
     * Punto de extensión: qué pasa al hacer clic en una tarjeta.
     * Hoy no hace nada (el alert original estaba comentado).
     */
    mostrarDetalle(producto) {
        // Ejemplo: alert(`${producto.nombre}\n${producto.descripcion}`);
    }
}
