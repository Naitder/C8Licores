import { EstrategiaBusqueda } from './EstrategiaBusqueda.js';

/**
 * Búsqueda simple por inclusión de texto. No se usa por defecto; existe para
 * mostrar que la estrategia se puede intercambiar sin tocar el buscador.
 */
export class BusquedaExacta extends EstrategiaBusqueda {
    coincide(nombre, termino) {
        return nombre.includes(termino);
    }
}
