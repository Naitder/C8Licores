import { Usuario } from '../modelos/Usuario.js';
import { Resultado } from '../modelos/Resultado.js';

/**
 * Casos de uso de acceso: iniciar sesión, registrarse y salir.
 * No toca el DOM: devuelve un Resultado y el formulario decide qué mostrar
 * (separación entre lógica y presentación).
 */
export class AutenticacionServicio {
    static MENSAJE_CREDENCIALES = 'El usuario/correo o la contraseña son incorrectos.';

    #usuarios;
    #sesion;
    #validadorRegistro;

    /**
     * @param {object} dependencias
     * @param {import('./UsuarioRepositorio.js').UsuarioRepositorio} dependencias.usuarios
     * @param {import('./SesionServicio.js').SesionServicio} dependencias.sesion
     * @param {import('../validacion/Validador.js').Validador} dependencias.validadorRegistro
     */
    constructor({ usuarios, sesion, validadorRegistro }) {
        this.#usuarios = usuarios;
        this.#sesion = sesion;
        this.#validadorRegistro = validadorRegistro;
    }

    iniciarSesion(identificador, password) {
        const usuario = this.#usuarios.buscarPorCredenciales(identificador, password);
        if (!usuario) return Resultado.fallo(AutenticacionServicio.MENSAJE_CREDENCIALES);
        this.#sesion.iniciar(usuario);
        return Resultado.exito(usuario);
    }

    /** @param {{name:string, email:string, password:string, confirmPassword:string}} datos */
    registrar(datos) {
        const error = this.#validadorRegistro.validar(datos);
        if (error) return Resultado.fallo(error);

        const usuario = new Usuario({ name: datos.name, email: datos.email, password: datos.password });
        this.#usuarios.guardar(usuario);
        this.#sesion.iniciar(usuario);
        return Resultado.exito(usuario);
    }

    cerrarSesion() {
        this.#sesion.cerrar();
    }
}
