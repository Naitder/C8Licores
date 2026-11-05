/**
 * Clase abstracta (patrón Estrategia) para filtrar productos.
 *
 * SOLID - O (Abierto/Cerrado): para un nuevo tipo de búsqueda se crea otra
 * subclase; ni el buscador ni el catálogo se modifican.
 */
export class EstrategiaBusqueda {
    constructor() {
        if (new.target === EstrategiaBusqueda) {
            throw new TypeError('EstrategiaBusqueda es abstracta y no se puede instanciar.');
        }
    }

    /**
     * @abstract
     * @param {string} nombreNormalizado nombre del producto en minúsculas
     * @param {string} terminoNormalizado texto buscado en minúsculas
     * @returns {boolean}
     */
    coincide(nombreNormalizado, terminoNormalizado) {
        throw new Error(`${this.constructor.name} debe implementar coincide().`);
    }

    /** Método plantilla: normaliza y delega la decisión en `coincide`. */
    filtrar(lista, termino) {
        const terminoNormalizado = String(termino).toLowerCase();
        return lista.filter(producto => {
            const nombre = (producto.nombre || producto.titulo || '').toLowerCase();
            return this.coincide(nombre, terminoNormalizado);
        });
    }
}
