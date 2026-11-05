import { ErrorApp } from '../errores.js';
import { hoyLocal } from '../tiempo.js';
import { PERMISOS } from './PermisoServicio.js';

/** Qué permiso necesita cada campo que el vendedor puede cambiar de un producto. */
const PERMISO_DE_CAMPO = Object.freeze({
    stock: 'editar_stock',
    precio: 'editar_precios',
    nombre: 'editar_productos',
    descripcion: 'editar_productos',
    imagen: 'editar_productos',
    medida: 'editar_productos',
    categoria: 'editar_productos',
    popular: 'editar_productos',
    estado: 'editar_productos'
});

/**
 * Lo que ve y hace el vendedor en su módulo. Es un subconjunto del panel de
 * administración: no crea ni elimina productos ni gestiona cuentas, y cada
 * edición de producto exige el permiso correspondiente al campo.
 */
export class VendedorServicio {
    #db;
    #jornadas;
    #turnos;
    #permisos;
    #notificaciones;
    #productos;

    constructor({ db, jornadas, turnos, permisos, notificaciones, productos }) {
        this.#db = db;
        this.#jornadas = jornadas;
        this.#turnos = turnos;
        this.#permisos = permisos;
        this.#notificaciones = notificaciones;
        this.#productos = productos;
    }

    panel(usuario) {
        const hoy = hoyLocal(this.#db);
        return {
            jornadaActiva: this.#jornadas.activa(usuario.id),
            turnoHoy: this.#turnos.asignacionDelDia(usuario.id, hoy),
            proximos: this.#turnos.proximasPara(usuario.id),
            permisos: this.#permisos.efectivos(usuario),
            notificaciones: this.#notificaciones.listarPara(usuario.id, 20),
            noLeidas: this.#notificaciones.noLeidas(usuario.id)
        };
    }

    actualizarProducto(usuario, id, datos = {}) {
        const campos = Object.keys(datos);
        if (campos.length === 0) throw new ErrorApp(400, 'No enviaste cambios.');

        const desconocidos = campos.filter(c => !(c in PERMISO_DE_CAMPO));
        if (desconocidos.length) {
            throw new ErrorApp(400, 'Datos no válidos.', {
                campos: `Campos que no puedes editar: ${desconocidos.join(', ')}.`
            });
        }

        const necesarios = [...new Set(campos.map(c => PERMISO_DE_CAMPO[c]))];
        const faltantes = necesarios.filter(p => !this.#permisos.tiene(usuario, p));
        if (faltantes.length) {
            throw new ErrorApp(403, `No tienes permiso para: ${faltantes.map(p => PERMISOS[p]).join('; ')}.`);
        }

        return this.#productos.actualizar(id, datos, usuario);
    }
}
