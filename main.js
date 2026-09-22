import { Aplicacion } from './js/app/Aplicacion.js';

/**
 * Punto de entrada. Toda la lógica que antes estaba aquí (variables globales,
 * carga de JSON, slider y botón "Explora la colección") ahora vive en clases
 * dentro de /js. Este archivo solo arranca la aplicación.
 */

document.addEventListener('DOMContentLoaded', () => {
    new Aplicacion().iniciar().catch(error => console.error('Error al iniciar la aplicación:', error));
});
