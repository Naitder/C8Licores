/**
 * Cola de pedidos web. La usan el vendedor en turno y el superadministrador con las mismas rutas:
 * el servidor decide qué puede tomar y completar cada uno. Pedir la lista requiere turno o ser superadministrador.
 */
import { $, api, el, tabla, pesos, ETIQUETAS_FORMA_PAGO } from './panel.js';

const ETIQUETAS_ESTADO_WEB = { pendiente_pago: 'Pendiente de pago', completado: 'Completado', cancelado: 'Cancelado' };

/**
 * @param {{ avisar: Function, nombreUsuario: () => string }} opciones
 * @returns {() => Promise<void>} función que carga la cola en las tablas de la sección «Pedidos web».
 */
export function montarPedidosWeb({ avisar, nombreUsuario }) {
    async function cargar() {
        const datos = await api('/vendedor/pedidos-web');
        $('pedidos-web-estado').textContent = datos.turnoActivo
            ? `Pendientes: ${datos.pendientes.length}. Al tomar un pedido queda a tu nombre.`
            : 'Marca tu entrada en Inicio para recibir y atender pedidos web.';

        tabla('tabla-pedidos-pendientes', ['Pedido', 'Cliente', 'Celular', 'Entrega', 'Total', 'Pago', ''],
            datos.pendientes.map(p => el('tr', {},
                el('td', { textContent: `#${p.id}` }),
                el('td', { textContent: p.clienteNombre ?? p.cliente ?? '' }),
                el('td', { textContent: p.clienteTelefono ?? 'Sin número' }),
                el('td', { textContent: p.direccion }),
                el('td', { textContent: pesos.format(p.total) }),
                el('td', { textContent: ETIQUETAS_FORMA_PAGO[p.metodoPago] ?? p.metodoPago }),
                el('td', {}, el('button', {
                    type: 'button', class: 'admin-boton pequeno', textContent: 'Atender',
                    disabled: !datos.turnoActivo, onclick: () => atender(p.id)
                })))));

        tabla('tabla-pedidos-atendidos', ['Pedido', 'Cliente', 'Celular', 'Atendió', 'Total', 'Estado', ''],
            datos.atendidos.map(p => {
                const mio = p.vendedor === nombreUsuario() && p.estado === 'pendiente_pago';
                return el('tr', {},
                    el('td', { textContent: `#${p.id}` }),
                    el('td', { textContent: p.clienteNombre ?? p.cliente ?? '' }),
                    el('td', { textContent: p.clienteTelefono ?? 'Sin número' }),
                    el('td', { textContent: p.vendedor ?? '' }),
                    el('td', { textContent: pesos.format(p.total) }),
                    el('td', {}, el('span', { class: `chip chip-${p.estado}`, textContent: ETIQUETAS_ESTADO_WEB[p.estado] ?? p.estado })),
                    el('td', { class: 'acciones-celda' }, mio
                        ? [
                            el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Completar', onclick: () => cambiarEstado(p.id, 'completado') }),
                            el('button', { type: 'button', class: 'admin-boton pequeno secundario', textContent: 'Cancelar', onclick: () => cambiarEstado(p.id, 'cancelado') })
                        ]
                        : null));
            }));
    }

    async function atender(id) {
        try {
            await api(`/vendedor/pedidos/${id}/atender`, { metodo: 'POST' });
            avisar(`Pedido #${id} tomado. Ya queda a tu nombre.`, 'ok');
        } catch (error) {
            avisar(error.message);
        }
        await cargar().catch(e => avisar(e.message));
    }

    async function cambiarEstado(id, estadoNuevo) {
        try {
            await api(`/vendedor/pedidos/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado: estadoNuevo } });
            avisar(`Pedido #${id} ${estadoNuevo === 'completado' ? 'completado' : 'cancelado'}.`, 'ok');
        } catch (error) {
            avisar(error.message);
        }
        await cargar().catch(e => avisar(e.message));
    }

    return cargar;
}
