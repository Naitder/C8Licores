/**
 * Módulo de vendedor. La página solo presenta lo que el servidor permite: el
 * rol, la jornada y los permisos se validan en la API en cada acción.
 * Los totales de la venta se piden al servidor (cotización), igual que en la tienda.
 */

import { $, api, el, tabla, pesos, fechaCorta, aFecha, horaLocal, crearAvisos, ETIQUETAS_FORMA_PAGO, ETIQUETAS_PEDIDO, montarMenuMovil } from '../comun/panel.js';
import { crearGestorPromociones } from '../comun/promociones.js';
import { botonGenerarFactura, cargarFacturasGuardadas } from '../comun/facturas.js';
import { montarPerfil } from '../comun/perfil.js';
import { montarPedidosWeb } from '../comun/pedidosWeb.js';
import { montarVenta } from '../comun/venta.js';

const avisar = crearAvisos('vend-aviso');

const NOMBRE_PERMISO = {
    editar_stock: 'ajustar existencias',
    editar_precios: 'cambiar precios',
    gestionar_promociones: 'crear o quitar promociones',
    editar_productos: 'mostrar u ocultar productos'
};

const ETIQUETAS_ESTADO = { disponible: 'Disponible', agotado: 'Agotado', inactivo: 'Oculto' };

const promociones = crearGestorPromociones({
    avisar,
    obtenerProductos: async () => (await api('/vendedor/productos')).productos
});

const estado = {
    usuario: null,
    panel: null,
    productos: [],
    editandoId: null      // producto con la fila de edición abierta
};

const esAdmin = () => estado.usuario.rol === 'superadmin';
const tienePermiso = (permiso) => esAdmin() || (estado.panel?.permisos ?? []).includes(permiso);
const puedeVender = () => esAdmin() || Boolean(estado.panel?.jornadaActiva);
/* ---------- Inicio: jornada, turno y notificaciones ---------- */

async function cargarPanel() {
    const { panel } = await api('/vendedor/panel');
    estado.panel = panel;
    pintarInicio();
    venta.refrescar();
    $('aviso-sin-jornada').classList.toggle('oculto', puedeVender());
    $('nav-promociones').classList.toggle('oculto', !tienePermiso('gestionar_promociones'));
}

function pintarInicio() {
    const p = estado.panel;
    const jornada = p.jornadaActiva;

    $('jornada-estado').textContent = esAdmin()
        ? 'Vista de superadministrador: las jornadas las marca cada vendedor desde su cuenta.'
        : jornada
            ? `En turno desde las ${horaLocal(jornada.entradaEn)}${jornada.turno ? ` (${jornada.turno})` : ''}.`
            : 'Sin entrada registrada.';
    $('btn-entrada').classList.toggle('oculto', esAdmin());
    $('btn-salida').classList.toggle('oculto', esAdmin());
    $('btn-entrada').disabled = Boolean(jornada) || !p.turnoHoy;
    $('btn-salida').disabled = !jornada;

    $('turno-hoy').textContent = p.turnoHoy
        ? `${p.turnoHoy.turno}: de ${p.turnoHoy.horaInicio} a ${p.turnoHoy.horaFin}.`
        : 'No tienes un turno asignado para hoy.';

    tabla('tabla-proximos', ['Fecha', 'Turno', 'Horario'], p.proximos.map(t => el('tr', {},
        el('td', { textContent: t.fecha }),
        el('td', { textContent: t.turno }),
        el('td', { textContent: `${t.horaInicio} – ${t.horaFin}` }))));

    $('notif-contador').textContent = p.noLeidas ? `${p.noLeidas} sin leer` : '';
    $('lista-notificaciones').replaceChildren(...(p.notificaciones.length
        ? p.notificaciones.map(n => el('li', { class: n.leida ? '' : 'nueva' },
            el('span', {}, n.mensaje, el('br'), el('small', { textContent: fechaCorta.format(aFecha(n.creadoEn)) })),
            n.leida ? null : el('button', {
                type: 'button',
                class: 'admin-boton pequeno secundario',
                textContent: 'Marcar leída',
                onclick: () => marcarLeida(n.id)
            })))
        : [el('li', { textContent: 'No tienes notificaciones.' })]));
}

async function marcarEntrada() {
    try {
        await api('/vendedor/jornada/entrada', { metodo: 'POST' });
        avisar('Entrada registrada.', 'ok');
        await cargarPanel();
    } catch (error) {
        avisar(error.message);
    }
}

async function marcarSalida() {
    try {
        await api('/vendedor/jornada/salida', { metodo: 'POST' });
        avisar('Salida registrada.', 'ok');
        await cargarPanel();
    } catch (error) {
        avisar(error.message);
    }
}

async function marcarLeida(id) {
    try {
        await api(`/notificaciones/${id}/leer`, { metodo: 'POST' });
        await cargarPanel();
    } catch (error) {
        avisar(error.message);
    }
}

/* ---------- Venta en tienda ---------- */

async function cargarProductos() {
    const { productos } = await api('/vendedor/productos');
    estado.productos = productos;
    pintarProductos();
}

function pintarCatalogo() {
    const busqueda = $('buscar-producto').value.trim().toLowerCase();
    const visibles = estado.productos
        .filter(p => p.estado !== 'inactivo' && p.nombre.toLowerCase().includes(busqueda));

    tabla('tabla-catalogo', ['Producto', 'Precio', 'Existencias', ''], visibles.map(p => {
        const enCarrito = estado.carrito.get(p.id)?.cantidad ?? 0;
        const disponibles = p.stock - enCarrito;
        return el('tr', {},
            el('td', {},
                el('strong', { textContent: p.nombre }), el('br'),
                el('small', { textContent: p.medida ?? '' }),
                p.promocion ? [el('br'), el('span', { class: 'chip chip-disponible', textContent: p.promocion.texto })] : null),
            el('td', { textContent: pesos.format(p.precioFinal) }),
            el('td', { textContent: String(disponibles) }),
            el('td', {}, el('button', {
                type: 'button',
                class: 'admin-boton pequeno',
                textContent: 'Agregar',
                disabled: disponibles <= 0,
                onclick: () => agregarAlCarrito(p.id)
            })));
    }));
}

/** Cualquier cambio en el carrito: redibuja y vuelve a cotizar en el servidor. */
function cambiarCarrito() {
    $('enlace-factura-p').classList.add('oculto');
    pintarCatalogo();
    pintarCarrito();
    pintarTotales();
    recotizar();
}

async function recotizar() {
    const version = ++estado.versionCotizacion;
    estado.cotizacion = null;
    if (estado.carrito.size === 0) {
        pintarCarrito();
        pintarTotales();
        return;
    }
    try {
        const { cotizacion } = await api('/pedidos/cotizacion', { metodo: 'POST', cuerpo: { items: lineasCarrito() } });
        if (version !== estado.versionCotizacion) return;
        estado.cotizacion = cotizacion;
    } catch (error) {
        if (version !== estado.versionCotizacion) return;
        avisar(error.message);
    }
    pintarCarrito();
    pintarTotales();
}

function agregarAlCarrito(id) {
    const producto = estado.productos.find(p => p.id === id);
    const actual = estado.carrito.get(id)?.cantidad ?? 0;
    if (!producto || actual + 1 > producto.stock) {
        avisar(`Solo hay ${producto?.stock ?? 0} unidad(es) de ${producto?.nombre ?? 'este producto'}.`);
        return;
    }
    estado.carrito.set(id, { producto, cantidad: actual + 1 });
    cambiarCarrito();
}

function pintarCarrito() {
    const lineas = new Map((estado.cotizacion?.lineas ?? []).map(l => [l.productoId, l]));
    const filas = [...estado.carrito.values()].map(({ producto, cantidad }) => {
        const linea = lineas.get(producto.id);
        const campo = el('input', {
            type: 'number', min: '1', max: String(producto.stock), step: '1',
            value: String(cantidad), 'aria-label': `Cantidad de ${producto.nombre}`
        });
        campo.addEventListener('change', () => {
            const n = Math.trunc(Number(campo.value));
            if (!Number.isInteger(n) || n < 1) {
                campo.value = String(cantidad);
                return;
            }
            if (n > producto.stock) {
                avisar(`Solo hay ${producto.stock} unidad(es) de ${producto.nombre}.`);
                campo.value = String(cantidad);
                return;
            }
            estado.carrito.set(producto.id, { producto, cantidad: n });
            cambiarCarrito();
        });

        const subtotal = linea ? linea.subtotal : producto.precioFinal * cantidad;
        return el('tr', {},
            el('td', {},
                producto.nombre,
                linea?.promocion ? [el('br'), el('small', { class: 'vend-promo', textContent: linea.promocion })] : null,
                linea && !linea.disponible ? [el('br'), el('small', { class: 'vend-sin-stock', textContent: 'Sin existencias suficientes' })] : null),
            el('td', {}, campo),
            el('td', { textContent: pesos.format(subtotal) }),
            el('td', {}, el('button', {
                type: 'button',
                class: 'admin-boton pequeno secundario',
                textContent: 'Quitar',
                onclick: () => { estado.carrito.delete(producto.id); cambiarCarrito(); }
            })));
    });
    tabla('tabla-carrito', ['Producto', 'Cant.', 'Subtotal', ''], filas);
}

function pintarTotales() {
    const cot = estado.cotizacion;
    const total = cot ? cot.total : totalLocal();
    const efectivo = $('forma-pago').value === 'efectivo';
    const campoRecibido = $('pago-recibido');
    const hayRecibido = campoRecibido.value !== '';
    const recibido = Number(campoRecibido.value);

    $('total-venta').textContent = pesos.format(total);
    $('descuento-venta').textContent = pesos.format(cot?.descuento ?? 0);
    $('iva-venta').textContent = pesos.format(cot ? cot.iva : Math.round(total - total / 1.19));
    $('bloque-efectivo').classList.toggle('oculto', !efectivo);

    let textoCambio = pesos.format(0);
    if (efectivo && hayRecibido) {
        const diferencia = recibido - total;
        textoCambio = diferencia >= 0 ? pesos.format(diferencia) : `Faltan ${pesos.format(-diferencia)}`;
    }
    $('cambio-venta').textContent = textoCambio;

    const pedirFactura = $('pedir-factura').checked;
    $('bloque-factura').classList.toggle('oculto', !pedirFactura);
    const facturaCompleta = !pedirFactura
        || ($('factura-nombre').value.trim() !== '' && $('factura-identificacion').value.trim() !== '');

    const pagoCompleto = !efectivo || (hayRecibido && recibido >= total);
    const sinProblemas = Boolean(cot?.disponible);
    const verificacionCompleta = $('venta-nacimiento').value !== '' && $('venta-cedula').value.trim() !== '';
    $('registrar-venta').disabled = !(total > 0 && puedeVender() && pagoCompleto && facturaCompleta
        && sinProblemas && verificacionCompleta);
}

async function registrarVenta(evento) {
    evento.preventDefault();
    const f = evento.target;
    const efectivo = f.formaPago.value === 'efectivo';
    const pedirFactura = $('pedir-factura').checked;
    const cuerpo = {
        verificacion: {
            fechaNacimiento: $('venta-nacimiento').value,
            identificacion: $('venta-cedula').value.trim()
        },
        items: lineasCarrito(),
        formaPago: f.formaPago.value,
        pagoRecibido: efectivo ? Number(f.pagoRecibido.value) : undefined,
        factura: pedirFactura
            ? { nombre: $('factura-nombre').value.trim(), identificacion: $('factura-identificacion').value.trim() }
            : undefined
    };
    try {
        const { venta } = await api('/vendedor/ventas', { metodo: 'POST', cuerpo });
        avisar(venta.cambio > 0
            ? `Venta #${venta.id} registrada. Devuelve ${pesos.format(venta.cambio)} de cambio.`
            : `Venta #${venta.id} registrada por ${pesos.format(venta.total)}.`, 'ok');

        if (venta.facturaNumero) {
            const enlace = $('enlace-factura');
            enlace.href = `/api/pedidos/${venta.id}/factura`;
            enlace.textContent = `Descargar factura ${venta.facturaNumero} (PDF)`;
            $('enlace-factura-p').classList.remove('oculto');
        }

        estado.carrito.clear();
        estado.cotizacion = null;
        f.reset();
        $('pedir-factura').checked = false;
        await cargarProductos();
        pintarTotales();
    } catch (error) {
        avisar(error.message);
    }
}

function vaciarVenta() {
    estado.carrito.clear();
    estado.cotizacion = null;
    $('form-venta').reset();
    $('pedir-factura').checked = false;
    $('enlace-factura-p').classList.add('oculto');
    cambiarCarrito();
}

/* ---------- Mis ventas ---------- */

async function cargarVentas() {
    const { ventas } = await api('/vendedor/ventas');
    const encabezados = ['Nº', 'Fecha', ...(esAdmin() ? ['Vendedor'] : []), 'Turno', 'Artículos', 'Total', 'Pago', 'Recibido', 'Cambio', 'Factura'];
    tabla('tabla-ventas', encabezados, ventas.map(v => el('tr', {},
        el('td', { textContent: `#${v.id}` }),
        el('td', { textContent: fechaCorta.format(aFecha(v.creadoEn)) }),
        esAdmin() ? el('td', { textContent: v.vendedor ?? '—' }) : null,
        el('td', { textContent: v.turno ?? '—' }),
        el('td', { textContent: v.items.map(i => `${i.cantidad} × ${i.nombre}`).join(', ') }),
        el('td', { textContent: pesos.format(v.total) }),
        el('td', { textContent: ETIQUETAS_FORMA_PAGO[v.formaPago] ?? '—' }),
        el('td', { textContent: pesos.format(v.pagoRecibido) }),
        el('td', { textContent: pesos.format(v.cambio) }),
        el('td', {}, v.facturaNumero
            ? el('a', { href: `/api/pedidos/${v.id}/factura`, target: '_blank', rel: 'noopener', textContent: `${v.facturaNumero} (PDF)` })
            : botonGenerarFactura(v, cargarVentas) ?? '—'))));
}

/* ---------- Productos: misma vista que el administrador, con lo que el permiso permite ---------- */

function pintarProductos() {
    const puedeEditar = tienePermiso('editar_stock') || tienePermiso('editar_precios');
    const puedeOcultar = tienePermiso('editar_productos');
    const etiquetas = ['editar_stock', 'editar_precios', 'editar_productos']
        .filter(tienePermiso).map(p => NOMBRE_PERMISO[p]);

    $('texto-permisos').textContent = esAdmin()
        ? 'Como superadministrador puedes editar existencias, precios y visibilidad. Las promociones están en su propia sección.'
        : etiquetas.length
            ? `Tus permisos: ${etiquetas.join(', ')}. Solo puedes cambiar esos campos.`
            : 'Solo puedes vender. Si necesitas cambiar existencias o precios, pide permiso al administrador.';

    const conAcciones = puedeEditar || puedeOcultar;
    const encabezados = ['Imagen', 'Producto', 'Precio', 'Existencias', 'Estado', ...(conAcciones ? ['Acciones'] : [])];
    const filas = [];
    for (const p of estado.productos) {
        filas.push(filaProducto(p, { puedeEditar, puedeOcultar, columnas: encabezados.length }));
        if (estado.editandoId === p.id && puedeEditar) filas.push(filaEdicion(p, encabezados.length));
    }
    tabla('tabla-productos-vendedor', encabezados, filas);
}

function filaProducto(p, { puedeEditar, puedeOcultar }) {
    const visible = p.estado !== 'inactivo';
    const celdas = [
        el('td', {}, el('img', {
            class: 'miniatura', src: '/' + p.imagen, alt: p.nombre,
            onerror: (e) => { e.target.style.visibility = 'hidden'; }
        })),
        el('td', {},
            el('strong', { textContent: p.nombre }), el('br'),
            el('small', { textContent: p.categoria ?? '' }),
            p.promocion ? [el('br'), el('span', { class: 'chip chip-disponible', textContent: p.promocion.texto })] : null),
        el('td', {}, p.precioFinal < p.precio
            ? [el('s', { textContent: pesos.format(p.precio) }), ' ', el('strong', { textContent: pesos.format(p.precioFinal) })]
            : pesos.format(p.precio)),
        el('td', { textContent: String(p.stock) }),
        el('td', {}, el('span', { class: `chip chip-${p.estado}`, textContent: ETIQUETAS_ESTADO[p.estado] ?? p.estado }))
    ];

    if (puedeEditar || puedeOcultar) {
        const acciones = [];
        if (puedeEditar) {
            acciones.push(el('button', {
                type: 'button',
                class: 'admin-boton pequeno',
                textContent: estado.editandoId === p.id ? 'Cerrar' : 'Editar',
                onclick: () => { estado.editandoId = estado.editandoId === p.id ? null : p.id; pintarProductos(); }
            }));
        }
        if (puedeOcultar) {
            acciones.push(el('button', {
                type: 'button',
                class: 'admin-boton pequeno secundario',
                textContent: visible ? 'Ocultar' : 'Mostrar',
                onclick: () => cambiarVisibilidad(p)
            }));
        }
        celdas.push(el('td', { class: 'acciones-celda' }, acciones));
    }
    return el('tr', {}, celdas);
}

function filaEdicion(p, columnas) {
    const campos = {};
    const controles = [];
    if (tienePermiso('editar_stock')) {
        const input = el('input', { type: 'number', min: '0', step: '1', value: String(p.stock), 'aria-label': 'Existencias' });
        campos.stock = { input, original: p.stock };
        controles.push(el('label', {}, 'Existencias ', input));
    }
    if (tienePermiso('editar_precios')) {
        const input = el('input', { type: 'number', min: '0', step: '1', value: String(p.precio), 'aria-label': 'Precio' });
        campos.precio = { input, original: p.precio };
        controles.push(el('label', {}, 'Precio (COP) ', input));
    }
    const guardar = el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Guardar', onclick: () => guardarProducto(p, campos) });
    const cancelar = el('button', {
        type: 'button', class: 'admin-boton pequeno secundario', textContent: 'Cancelar',
        onclick: () => { estado.editandoId = null; pintarProductos(); }
    });
    return el('tr', { class: 'fila-edicion' },
        el('td', { colSpan: columnas },
            el('div', { class: 'fila-edicion-campos' }, controles),
            el('div', { class: 'admin-acciones' }, guardar, cancelar)));
}

async function guardarProducto(p, campos) {
    const cambios = {};
    for (const [clave, { input, original }] of Object.entries(campos)) {
        const texto = input.value.trim();
        if (texto === '' || !Number.isInteger(Number(texto)) || Number(texto) < 0) {
            avisar(`Escribe un número entero válido en ${clave === 'stock' ? 'existencias' : 'precio'}.`);
            return;
        }
        if (Number(texto) !== original) cambios[clave] = Number(texto);
    }
    if (!Object.keys(cambios).length) {
        avisar('No hay cambios que guardar.');
        return;
    }
    try {
        await api(`/vendedor/productos/${p.id}`, { metodo: 'PATCH', cuerpo: cambios });
        avisar(`«${p.nombre}» actualizado.`, 'ok');
        estado.editandoId = null;
        await cargarProductos();
    } catch (error) {
        avisar(error.message);
    }
}

async function cambiarVisibilidad(p) {
    const ocultar = p.estado !== 'inactivo';
    try {
        await api(`/vendedor/productos/${p.id}`, { metodo: 'PATCH', cuerpo: { estado: ocultar ? 'inactivo' : 'disponible' } });
        avisar(ocultar ? `«${p.nombre}» ya no aparece en la tienda.` : `«${p.nombre}» volvió a la tienda.`, 'ok');
        await cargarProductos();
    } catch (error) {
        avisar(error.message);
    }
}

/* ---------- navegación y arranque ---------- */

/* ---------- Pedidos web del turno ---------- */

const cargarPedidosWeb = montarPedidosWeb({ avisar, nombreUsuario: () => estado.usuario.nombre });

/* ---------- Pedidos del turno ---------- */

async function cargarPedidosVendedor() {
    const { pedidos } = await api('/vendedor/pedidos');
    tabla('tabla-pedidos',
        ['Nº', 'Fecha', 'Origen', 'Cliente', 'Atendió', 'Artículos', 'Total', 'Pago', 'Estado', 'Factura'],
        pedidos.map(p => el('tr', {},
            el('td', { textContent: `#${p.id}` }),
            el('td', { textContent: fechaCorta.format(aFecha(p.creadoEn)) }),
            el('td', { textContent: p.origen === 'tienda' ? 'Tienda' : 'Web' }),
            el('td', { textContent: p.cliente ?? '' }),
            el('td', { textContent: p.vendedor ?? '—' }),
            el('td', { textContent: p.items.map(i => `${i.cantidad} × ${i.nombre}`).join(', ') }),
            el('td', { textContent: pesos.format(p.total) }),
            el('td', { textContent: ETIQUETAS_FORMA_PAGO[p.formaPago] ?? '—' }),
            el('td', {}, el('span', { class: `chip chip-${p.estado}`, textContent: ETIQUETAS_PEDIDO[p.estado] ?? p.estado })),
            el('td', {}, p.facturaNumero
                ? el('a', { href: `/api/pedidos/${p.id}/factura`, target: '_blank', rel: 'noopener', textContent: `${p.facturaNumero} (PDF)` })
                : botonGenerarFactura(p, cargarPedidosVendedor) ?? '—'))));
}
const venta = montarVenta({ avisar, puedeVender });

const CARGADORES = {
    inicio: cargarPanel,
    'pedidos-web': cargarPedidosWeb,
    pedidos: cargarPedidosVendedor,
    venta: async () => { await cargarPanel(); await venta.cargar(); },
    ventas: cargarVentas,
    facturas: () => cargarFacturasGuardadas('todas'),
    productos: async () => { await cargarPanel(); await cargarProductos(); },
    promociones: async () => { await cargarPanel(); await promociones.cargar(); },
    perfil: () => montarPerfil(document.getElementById('perfil-contenido'))
};

async function mostrarSeccion(nombre) {
    document.querySelectorAll('[data-seccion]').forEach(b => b.classList.toggle('activo', b.dataset.seccion === nombre));
    document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
    $(`sec-${nombre}`).classList.remove('oculto');
    try {
        await CARGADORES[nombre]();
    } catch (error) {
        avisar(error.message);
    }
}

async function iniciar() {
    montarMenuMovil(document.querySelector('.admin-menu-toggle'), document.querySelector('.admin-menu'));
    try {
        const { usuario } = await api('/auth/me');
        estado.usuario = usuario;
        // La cola de pedidos web se actualiza sola mientras la sección está abierta.
        setInterval(() => {
            if (!$('sec-pedidos-web').classList.contains('oculto')) cargarPedidosWeb().catch(() => {});
        }, 30000);
    } catch {
        location.replace('index_login.html');
        return;
    }

    if (!['vendedor', 'superadmin'].includes(estado.usuario.rol)) {
        $('vend-cargando').textContent = 'Este módulo es solo para vendedores. Redirigiendo a la tienda…';
        setTimeout(() => location.replace('index.html'), 2000);
        return;
    }
    if (estado.usuario.debeCambiarPassword && esAdmin()) {
        location.replace('index_admin.html');
        return;
    }

    try {
        await cargarPanel();
    } catch (error) {
        $('vend-cargando').textContent = error.message;
        return;
    }

    $('vend-cargando').remove();
    $('vend-app').classList.remove('oculto');
    $('vend-usuario').textContent = estado.usuario.nombre;
    $('vend-rol').textContent = esAdmin() ? 'Vista de superadministrador' : 'Vendedor';
    $('enlace-admin').classList.toggle('oculto', !esAdmin());

    document.querySelectorAll('[data-seccion]').forEach(b =>
        b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)));
    $('btn-entrada').addEventListener('click', marcarEntrada);
    $('btn-salida').addEventListener('click', marcarSalida);
    venta.iniciar();
    promociones.iniciar();
    $('vend-salir').addEventListener('click', async () => {
        await api('/auth/logout', { metodo: 'POST' }).catch(() => {});
        location.replace('index.html');
    });

    mostrarSeccion(location.hash === '#perfil' ? 'perfil' : 'inicio');
}

iniciar();
