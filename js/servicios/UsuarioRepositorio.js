import { Usuario } from '../modelos/Usuario.js';
import { UsuarioDemo } from '../modelos/UsuarioDemo.js';
import { CLAVES } from '../config/Configuracion.js';

/**
 * Acceso a los usuarios (demo + registrados en "usuarios_barrilete").
 * SOLID - S: solo guarda y busca usuarios; no valida ni muestra nada.
 */
export class UsuarioRepositorio {
    #almacenamiento;
    #clave;
    #usuarioDemo;

    constructor(almacenamiento, clave = CLAVES.USUARIOS, usuarioDemo = new UsuarioDemo()) {
        this.#almacenamiento = almacenamiento;
        this.#clave = clave;
        this.#usuarioDemo = usuarioDemo;
    }

    #registrados() {
        const datos = this.#almacenamiento.leerJSON(this.#clave, []);
        return Array.isArray(datos) ? datos.map(dato => Usuario.desdeJSON(dato)) : [];
    }

    listarTodos() {
        return [this.#usuarioDemo, ...this.#registrados()];
    }

    buscarPorCredenciales(identificador, password) {
        return this.listarTodos().find(u => u.verificarCredenciales(identificador, password)) ?? null;
    }

    existeEmail(email) {
        return this.listarTodos().some(u => u.tieneEmail(email));
    }

    guardar(usuario) {
        const registrados = this.#registrados();
        registrados.push(usuario);
        this.#almacenamiento.escribirJSON(this.#clave, registrados.map(u => u.aJSON()));
    }
}
