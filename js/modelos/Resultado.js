/**
 * Resultado de una operación (éxito o fallo con mensaje).
 * Evita que los servicios manipulen el DOM para mostrar errores: el servicio
 * devuelve un Resultado y el formulario decide cómo mostrarlo.
 */
export class Resultado {
    #exito;
    #mensaje;
    #valor;

    constructor(exito, mensaje = '', valor = null) {
        this.#exito = exito;
        this.#mensaje = mensaje;
        this.#valor = valor;
    }

    static exito(valor = null) { return new Resultado(true, '', valor); }
    static fallo(mensaje) { return new Resultado(false, mensaje); }

    get esExito() { return this.#exito; }
    get mensaje() { return this.#mensaje; }
    get valor() { return this.#valor; }
}
