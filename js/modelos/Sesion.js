/**
 * Estado de la sesión. Objeto inmutable: para cambiar la sesión se crea otra.
 * Mantiene el mismo formato guardado: { isLoggedIn, userName }.
 */
export class Sesion {
    #activa;
    #nombreUsuario;

    constructor(activa = false, nombreUsuario = '') {
        this.#activa = activa === true;
        this.#nombreUsuario = nombreUsuario;
        Object.freeze(this);
    }

    static anonima() {
        return new Sesion(false, '');
    }

    static paraUsuario(usuario) {
        return new Sesion(true, usuario.nombre);
    }

    static desdeJSON(datos) {
        return new Sesion(datos?.isLoggedIn === true, datos?.userName || '');
    }

    get estaActiva() { return this.#activa; }
    get nombreUsuario() { return this.#nombreUsuario; }

    aJSON() {
        return { isLoggedIn: this.#activa, userName: this.#nombreUsuario };
    }
}
