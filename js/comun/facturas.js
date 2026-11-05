/**
 * Acciones de factura compartidas por los paneles de administración y vendedor.
 * Pide los datos del cliente en una ventana emergente y los envía al servidor.
 */
import { api, el, pesos, tabla, fechaCorta, aFecha } from './panel.js';
import { informar, pedirDatosFactura } from './dialogo.js';

/** Botón "Generar factura" para un pedido que aún no tiene factura; null si no aplica. */
export function botonGenerarFactura(pedido, alGenerar) {
    if (pedido.facturaNumero || pedido.estado === 'cancelado') return null;
    return el('button', {
        type: 'button',
        class: 'admin-boton pequeno secundario',
        textContent: 'Generar factura',
        onclick: () => generarFactura(pedido, alGenerar)
    });
}

/** Pide los datos, genera la factura y la ofrece para descargar. */
export async function generarFactura(pedido, alTerminar) {
    const datos = await pedirDatosFactura({ total: pesos.format(pedido.total) });
    if (!datos) return;
    const { numero } = await api(`/pedidos/${pedido.id}/factura`, { metodo: 'POST', cuerpo: datos });
    await informar({
        titulo: 'Factura lista',
        mensajes: [`Factura ${numero} del pedido #${pedido.id}. Ya queda guardada para descargarla cuando quieras.`],
        enlace: { href: `/api/pedidos/${pedido.id}/factura`, texto: `Descargar ${numero} (PDF)` }
    });
    await alTerminar();
}

/**
 * Listado de facturas guardadas (admin: todas o las propias; vendedor: las de hoy).
 * Dibuja el resumen y la tabla en los elementos #resumen-facturas y #tabla-facturas.
 */
export async function cargarFacturasGuardadas(alcance = 'todas', turno = '') {
    const filtro = turno ? `&turno=${encodeURIComponent(turno)}` : '';
    const { facturas, resumen } = await api(`/facturas?alcance=${encodeURIComponent(alcance)}${filtro}`);
    const resumenBox = document.getElementById('resumen-facturas');
    resumenBox.replaceChildren(
        el('div', { class: 'admin-kpi' }, el('span', { textContent: 'Facturas' }), el('strong', { textContent: String(resumen.cantidad) })),
        el('div', { class: 'admin-kpi' }, el('span', { textContent: 'Total facturado' }), el('strong', { textContent: pesos.format(resumen.total) })),
        el('div', { class: 'admin-kpi' }, el('span', { textContent: 'IVA incluido' }), el('strong', { textContent: pesos.format(resumen.iva) })));

    tabla('tabla-facturas',
        ['Nº', 'Fecha', 'Origen', 'Cliente', 'Identificación', 'Pidió factura', 'Vendedor', 'Turno', 'Pago', 'Total', 'IVA'],
        facturas.map(f => el('tr', {},
            el('td', {}, el('a', { href: `/api/pedidos/${f.pedidoId}/factura`, target: '_blank', rel: 'noopener', textContent: f.numero })),
            el('td', { textContent: fechaCorta.format(aFecha(f.creadoEn)) }),
            el('td', { textContent: f.origen === 'tienda' ? 'Tienda' : 'Web' }),
            el('td', { textContent: f.cliente }),
            el('td', { textContent: f.identificacion }),
            el('td', { textContent: f.pedidaPorCliente ? 'Sí' : 'No' }),
            el('td', { textContent: f.vendedor ?? '—' }),
            el('td', { textContent: f.turno ?? '—' }),
            el('td', { textContent: f.metodoPago ?? '—' }),
            el('td', { textContent: pesos.format(f.total) }),
            el('td', { textContent: pesos.format(f.iva) }))));
}
