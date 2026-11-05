/**
 * Editor de promociones compartido por el panel de administración y el de
 * vendedor. Solo habla con /api/promociones (el servidor valida permisos y reglas).
 *
 * Cada producto tiene como máximo una promoción activa. Tipos:
 * - porcentaje: descuento sobre el precio unitario.
 * - monto: descuento fijo en pesos por unidad.
 * - nxm: al llevar N unidades se pagan M (ej. 2x1).
 */

import { $, api, el, tabla } from './panel.js';
import { confirmar, informar } from './dialogo.js';

/**
 * @param {object} opciones
 * @param {(mensaje: string, tipo?: string) => void} opciones.avisar
 * @param {() => Promise<object[]>} opciones.obtenerProductos  lista de productos (con id y nombre)
 * @param {string} [opciones.prefijo]  prefijo de los ids del HTML ('' en el admin)
 */
export function crearGestorPromociones({ avisar, obtenerProductos, prefijo = '' }) {
    const id = (base) => $(prefijo + base);
    let editandoId = null;
    let productos = [];

    async function cargar() {
        const [{ promociones }, lista] = await Promise.all([api('/promociones'), obtenerProductos()]);
        productos = lista;
        llenarOpcionesProducto();

        tabla(prefijo + 'tabla-promociones',
            ['Producto', 'Promoción', 'Descuento', 'Estado', 'Acciones'],
            promociones.map(pr => el('tr', {},
                el('td', { textContent: pr.productoNombre ?? `#${pr.productoId}` }),
                el('td', { textContent: pr.nombre }),
                el('td', { textContent: pr.texto }),
                el('td', {}, el('span', { class: `chip ${pr.activa ? 'chip-disponible' : 'chip-inactivo'}`, textContent: pr.activa ? 'Activa' : 'Inactiva' })),
                el('td', { class: 'acciones-celda' },
                    el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Editar', onclick: () => llenarFormulario(pr) }),
                    el('button', {
                        type: 'button',
                        class: 'admin-boton pequeno secundario',
                        textContent: pr.activa ? 'Desactivar' : 'Activar',
                        onclick: () => alternar(pr)
                    }),
                    el('button', { type: 'button', class: 'admin-boton pequeno secundario', textContent: 'Eliminar', onclick: () => eliminar(pr) }))
            )));
    }

    function llenarOpcionesProducto() {
        const select = id('form-promocion').productoId;
        const valor = select.value;
        select.replaceChildren(
            el('option', { value: '', textContent: 'Elige un producto' }),
            ...productos.map(p => el('option', { value: String(p.id), textContent: p.nombre })));
        select.value = valor;
    }

    /** Muestra solo los campos que corresponden al tipo elegido. */
    function actualizarCampos() {
        const tipo = id('form-promocion').tipo.value;
        id('form-promocion').querySelectorAll('[data-para]').forEach(campo => {
            campo.classList.toggle('oculto', !campo.dataset.para.split(' ').includes(tipo));
        });
    }

    function llenarFormulario(pr = null) {
        const f = id('form-promocion');
        f.reset();
        editandoId = pr ? pr.id : null;
        id('titulo-form-promocion').textContent = pr ? `Editar promoción: ${pr.nombre}` : 'Nueva promoción';
        f.productoId.disabled = Boolean(pr);
        if (pr) {
            f.productoId.value = String(pr.productoId);
            f.nombre.value = pr.nombre;
            f.tipo.value = pr.tipo;
            f.valor.value = pr.valor ?? '';
            f.lleva.value = pr.lleva ?? '';
            f.paga.value = pr.paga ?? '';
            f.activa.checked = pr.activa;
        } else {
            f.activa.checked = true;
        }
        actualizarCampos();
    }

    function datosDelFormulario(f) {
        const tipo = f.tipo.value;
        const cuerpo = { nombre: f.nombre.value.trim(), tipo, activa: f.activa.checked };
        if (!editandoId) cuerpo.productoId = Number(f.productoId.value);
        if (tipo === 'nxm') {
            cuerpo.lleva = Number(f.lleva.value);
            cuerpo.paga = Number(f.paga.value);
        } else {
            cuerpo.valor = Number(f.valor.value);
        }
        return cuerpo;
    }

    async function guardar(evento) {
        evento.preventDefault();
        const cuerpo = datosDelFormulario(id('form-promocion'));
        try {
            if (editandoId) {
                await api(`/promociones/${editandoId}`, { metodo: 'PUT', cuerpo });
                avisar('Promoción actualizada. El precio cambió en la tienda.', 'ok');
            } else {
                await api('/promociones', { metodo: 'POST', cuerpo });
                avisar('Promoción creada.', 'ok');
            }
            llenarFormulario(null);
            await cargar();
        } catch (error) {
            avisar(error.message);
        }
    }

    async function alternar(pr) {
        try {
            await api(`/promociones/${pr.id}`, { metodo: 'PUT', cuerpo: { activa: !pr.activa } });
            avisar(pr.activa ? `«${pr.nombre}» desactivada.` : `«${pr.nombre}» activada.`, 'ok');
            await cargar();
        } catch (error) {
            avisar(error.message);
        }
    }

    async function eliminar(pr) {
        if (!await confirmar({ titulo: 'Eliminar promoción', mensajes: [`¿Eliminar la promoción «${pr.nombre}»?`], aceptar: 'Eliminar' })) return;
        try {
            await api(`/promociones/${pr.id}`, { metodo: 'DELETE' });
            avisar('Promoción eliminada.', 'ok');
            if (editandoId === pr.id) llenarFormulario(null);
            await cargar();
        } catch (error) {
            await informar({ titulo: 'No se pudo eliminar', mensajes: [error.message] });
        }
    }

    function iniciar() {
        id('form-promocion').addEventListener('submit', guardar);
        id('form-promocion').tipo.addEventListener('change', actualizarCampos);
        id('cancelar-promocion').addEventListener('click', () => llenarFormulario(null));
    }

    return { cargar, iniciar, llenarFormulario };
}
