/**
 * Ingreso, registro y cierre de sesión contra el servidor (/api/auth/...).
 *
 * El servidor guarda la sesión en una cookie. Además se guarda un espejo en
 * el navegador (SesionServicio) para que el menú y el botón "Explora" sigan
 * sabiendo si hay sesión, sin cambiar esos componentes.
 */
export class AutenticacionApi {
    #sesion;
    #base;

    constructor({ sesion, base = '/api' }) {
        this.#sesion = sesion;
        this.#base = base;
    }

    async iniciarSesion(identificador, password) {
        const { usuario } = await this.#solicitar('/auth/login', 'POST', { identificador, password });
        this.#sesion.iniciar(usuario);
        return usuario;
    }

    async registrar(datos) {
        const { usuario } = await this.#solicitar('/auth/registro', 'POST', datos);
        this.#sesion.iniciar(usuario);
        return usuario;
    }

    /** Datos de verificación de la cuenta: { fechaNacimiento, identificacion } o null sin sesión. */
    async obtenerPerfil() {
        try {
            const { perfil } = await this.#solicitar('/auth/perfil', 'GET');
            return perfil;
        } catch {
            return null;
        }
    }

    async guardarPerfil({ fechaNacimiento, identificacion }) {
        const { perfil } = await this.#solicitar('/auth/perfil', 'PUT', { fechaNacimiento, identificacion });
        return perfil;
    }

    /** Usuario de la sesión actual según el servidor, o null si no hay sesión válida. */
    async usuarioActual() {
        try {
            const { usuario } = await this.#solicitar('/auth/me', 'GET');
            return usuario;
        } catch {
            return null;
        }
    }

    async cerrarSesion() {
        try {
            await this.#solicitar('/auth/logout', 'POST');
        } finally {
            this.#sesion.cerrar();
        }
    }

    async #solicitar(ruta, metodo, cuerpo) {
        let respuesta;
        try {
            respuesta = await fetch(this.#base + ruta, {
                method: metodo,
                credentials: 'same-origin',
                headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
                body: cuerpo ? JSON.stringify(cuerpo) : undefined
            });
        } catch {
            throw new Error('No se pudo conectar con el servidor. Verifica que esté encendido (npm start).');
        }

        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(mensajeDeError(datos));
        return datos;
    }
}

/** Muestra el primer detalle de validación si existe; si no, el mensaje general. */
function mensajeDeError(datos) {
    if (datos?.detalles?.codigo) return datos.error;
    const detalles = Object.values(datos?.detalles ?? {});
    return detalles[0] ?? datos?.error ?? 'Ocurrió un error inesperado.';
}
