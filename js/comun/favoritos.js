import { llamar } from './llamada.js';

/**
 * Productos guardados por la persona (sus "Guardados"). Se cargan una vez al abrir
 * la tienda; si no hay sesión válida, no se muestra el botón de guardar.
 */
let ids = null;

export async function cargarFavoritos() {
    try {
        const { favoritos } = await llamar('/favoritos');
        ids = new Set(favoritos.map(f => f.id));
    } catch {
        ids = null;
    }
}

export const hayFavoritos = () => ids !== null;
export const esFavorito = (productoId) => ids?.has(productoId) ?? false;

/** Guarda o quita el producto. Devuelve true si queda guardado. */
export async function alternarFavorito(productoId) {
    if (esFavorito(productoId)) {
        await llamar(`/favoritos/${productoId}`, 'DELETE');
        ids.delete(productoId);
    } else {
        await llamar('/favoritos', 'POST', { productoId });
        ids.add(productoId);
    }
    return esFavorito(productoId);
}
