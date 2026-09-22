/**
 * Configuración centralizada de la aplicación.
 * Antes estas cadenas estaban repetidas ("hardcodeadas") en main.js, user.js,
 * carrito.js y ui.js. Tenerlas en un solo lugar evita errores de escritura y
 * permite cambiarlas sin tocar la lógica (Principio Abierto/Cerrado).
 */

/** Claves usadas en el almacenamiento del navegador. */
export const CLAVES = Object.freeze({
    SESION: 'session_barrilete',
    CARRITO: 'carrito_barrilete',
    USUARIOS: 'usuarios_barrilete',
    FILTRO: 'filtro_barrilete',
    FILTRO_PENDIENTE: 'filtro_pendiente_barrilete'
});

/** Páginas de la aplicación. */
export const RUTAS = Object.freeze({
    INICIO: 'index.html',
    PRODUCTOS: 'index_productos.html',
    LOGIN: 'index_login.html'
});

/** Archivos de datos. */
export const FUENTES = Object.freeze({
    DIAPOSITIVAS: './json/productos.json',
    CATALOGO: './json/tarjetas.json'
});

/** Parámetros de comportamiento. */
export const PARAMETROS = Object.freeze({
    INTERVALO_SLIDER_MS: 5000,
    UMBRAL_BUSQUEDA: 0.8,
    LONGITUD_MINIMA_PASSWORD: 6,
    LOCALE: 'es-CO',
    SIMBOLO_MONEDA: '$'
});
