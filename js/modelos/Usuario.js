/**
 * Usuario registrado. La contraseña es privada: no existe un getter para ella,
 * solo el método `verificarCredenciales`, así nadie puede leerla desde fuera.
 */
export class Usuario {
    #nombre;
    #email;
    #password;

    constructor({ name = '', email = '', password = '' }) {
        this.#nombre = name;
        this.#email = email;
        this.#password = password;
    }

    static desdeJSON(datos = {}) {
        return new Usuario(datos);
    }

    get nombre() { return this.#nombre; }
    get email() { return this.#email; }
    get esDemo() { return false; }

    /** Acepta correo o nombre de usuario como identificador. */
    verificarCredenciales(identificador, password) {
        return (identificador === this.#email || identificador === this.#nombre)
            && password === this.#password;
    }

    tieneEmail(email) {
        return this.#email === email;
    }

    /** Formato idéntico al que ya estaba en localStorage ("usuarios_barrilete"). */
    aJSON() {
        return { name: this.#nombre, email: this.#email, password: this.#password };
    }
}
