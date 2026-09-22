import { ComponenteUI } from '../base/ComponenteUI.js';
import { RUTAS } from '../../config/Configuracion.js';

/**
 * Comportamiento común de los formularios de acceso.
 * Antes, login y registro repetían: preventDefault, lectura de campos,
 * mostrar el error y la redirección con el filtro pendiente.
 */
export class FormularioBase extends ComponenteUI {
    #idFormulario;
    #filtros;
    #navegador;
    #formulario;

    constructor({ idFormulario, filtros, navegador, documento }) {
        super(documento);
        if (new.target === FormularioBase) {
            throw new TypeError('FormularioBase es abstracta y no se puede instanciar.');
        }
        this.#idFormulario = idFormulario;
        this.#filtros = filtros;
        this.#navegador = navegador;
    }

    estaDisponible() {
        this.#formulario = this.obtener(this.#idFormulario);
        return Boolean(this.#formulario);
    }

    alMontar() {
        this.#formulario.addEventListener('submit', (evento) => {
            evento.preventDefault();
            this.procesar();
        });
    }

    /** @abstract Lógica propia de cada formulario. */
    procesar() {
        throw new Error(`${this.constructor.name} debe implementar procesar().`);
    }

    /** @protected Valor limpio de un campo (vacío si no existe). */
    valor(id) {
        return this.obtener(id)?.value.trim() ?? '';
    }

    /** @protected */
    mostrarError(mensaje) {
        const caja = this.obtener('error-box');
        if (!caja) return;
        caja.textContent = mensaje;
        caja.classList.remove('hidden');
    }

    /** @protected Si venía de "Explora la colección" va al catálogo; si no, al inicio. */
    redirigirTrasAutenticacion() {
        const destino = this.#filtros.promoverPendiente() ? RUTAS.PRODUCTOS : RUTAS.INICIO;
        this.#navegador.irA(destino);
    }
}
