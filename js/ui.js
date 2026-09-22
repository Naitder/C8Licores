/**
 * CAPA DE COMPATIBILIDAD (reemplazable).
 * Nuevos equivalentes:
 *   renderizarProducto          -> js/ui/componentes/SliderHero.js
 *   inicializarMenuHamburguesa  -> js/ui/componentes/MenuHamburguesa.js
 *   renderizarTarjetas          -> js/ui/componentes/CatalogoTarjetas.js + js/ui/elementos/TarjetaProducto.js
 *   inicializarBuscador         -> js/ui/componentes/BuscadorCatalogo.js
 */
import { ContenedorDependencias } from './app/ContenedorDependencias.js';
import { SliderHero } from './ui/componentes/SliderHero.js';
import { MenuHamburguesa } from './ui/componentes/MenuHamburguesa.js';
import { CatalogoTarjetas } from './ui/componentes/CatalogoTarjetas.js';
import { BuscadorCatalogo } from './ui/componentes/BuscadorCatalogo.js';
import { RepositorioLectura } from './core/RepositorioLectura.js';
import { FuenteDatosMemoria } from './core/FuenteDatosMemoria.js';
import { Producto } from './modelos/Producto.js';
import { Diapositiva } from './modelos/Diapositiva.js';

/** @deprecated usar SliderHero.mostrar(diapositiva, indice) */
export function renderizarProducto(producto, index) {
    const d = ContenedorDependencias.obtener();
    new SliderHero({ documento: d.documento }).mostrar(Diapositiva.desdeJSON(producto), index);
}

/** @deprecated usar new MenuHamburguesa().montar() */
export function inicializarMenuHamburguesa() {
    new MenuHamburguesa(ContenedorDependencias.obtener().documento).montar();
}

function crearCatalogo(listaTarjetas) {
    const d = ContenedorDependencias.obtener();
    return new CatalogoTarjetas({
        repositorio: new RepositorioLectura(new FuenteDatosMemoria(listaTarjetas), Producto.desdeJSON),
        carrito: d.carrito,
        formateador: d.formateador,
        documento: d.documento
    });
}

/** @deprecated usar CatalogoTarjetas.renderizar(productos) */
export function renderizarTarjetas(listaTarjetas) {
    crearCatalogo([]).renderizar(listaTarjetas.map(t => Producto.desdeJSON(t)));
}

/** @deprecated usar new BuscadorCatalogo({...}).montar() */
export async function inicializarBuscador(listaTarjetas) {
    const d = ContenedorDependencias.obtener();
    const catalogo = crearCatalogo(listaTarjetas);
    await catalogo.montar();
    return new BuscadorCatalogo({ catalogo, estrategia: d.estrategiaBusqueda, filtros: d.filtros, documento: d.documento }).montar();
}
