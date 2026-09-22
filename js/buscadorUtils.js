/**
 * CAPA DE COMPATIBILIDAD (reemplazable).
 * Conserva los nombres de función originales, pero ahora delegan en clases.
 * main.js ya no la usa; se puede borrar sin afectar la ejecución.
 *
 * Nuevo equivalente: js/busqueda/Levenshtein.js y js/busqueda/BusquedaSimilitud.js
 */
import { Levenshtein } from './busqueda/Levenshtein.js';
import { BusquedaSimilitud } from './busqueda/BusquedaSimilitud.js';

/** @deprecated usar Levenshtein.distancia(a, b) */
export function distanciaLevenshtein(a, b) {
    return Levenshtein.distancia(a, b);
}

/** @deprecated usar Levenshtein.similitud(a, b) */
export function similitudLevenshtein(a, b) {
    return Levenshtein.similitud(a, b);
}

/** @deprecated usar new BusquedaSimilitud(umbral).filtrar(lista, texto) */
export function filtrarPorSimilitud(lista, texto, umbral = 0.4) {
    return new BusquedaSimilitud(umbral).filtrar(lista, texto);
}
