/**
 * Panel del superadministrador. Habla solo con /api/admin/... y /api/auth/...
 * Las utilidades comunes (api, el, tabla, formatos) viven en js/comun/panel.js.
 */

import {
    $, api, el, tabla, pesos, fechaCorta as fecha, aFecha, horaLocal, fechaDeHoy,
    crearAvisos, ETIQUETAS_PEDIDO, ETIQUETAS_FORMA_PAGO, montarMenuMovil
} from '../comun/panel.js';
import { crearGestorPromociones } from '../comun/promociones.js';
import { confirmar, informar } from '../comun/dialogo.js';
import { botonGenerarFactura, cargarFacturasGuardadas } from '../comun/facturas.js';
import { montarPerfil } from '../comun/perfil.js';
import { montarPedidosWeb } from '../comun/pedidosWeb.js';
import { montarVenta } from '../comun/venta.js';

const avisar = crearAvisos('admin-aviso');
const promociones = crearGestorPromociones({
    avisar,
    obtenerProductos: async () => (await api('/vendedor/productos')).productos
});

const estado = {
    usuario: null,
    productos: [],
    productoEditandoId: null,
    turnos: [],
    turnoEditandoId: null,
    vendedoresActivos: [],
    catalogoPermisos: {}
};

/* ---------- Resumen ---------- */

async function cargarResumen() {
    const { resumen: r } = await api('/admin/resumen');
    const kpis = [
        ['Ventas de hoy', pesos.format(r.ingresosHoy)],
        ['Ventas completadas (total)', pesos.format(r.ingresosTotales)],
        ['Pedidos pendientes de pago', r.pedidosPendientes],
        ['Pedidos completados', r.pedidosCompletados],
        ['Productos visibles', r.productosActivos],
        ['Productos agotados', r.productosAgotados],
        ['Clientes activos', r.clientesActivos]
    ];
    $('kpis').replaceChildren(...kpis.map(([titulo, valor]) =>
        el('div', { class: 'admin-kpi' },
            el('span', { textContent: titulo }),
            el('strong', { textContent: String(valor) }))));
}

/* ---------- Productos ---------- */

function etiquetaEstadoProducto(producto) {
    const textos = { disponible: 'Disponible', agotado: 'Agotado', inactivo: 'Oculto' };
    return el('span', { class: `chip chip-${producto.estado}`, textContent: textos[producto.estado] ?? producto.estado });
}

async function cargarProductos() {
    const { productos } = await api('/admin/productos');
    estado.productos = productos;
    tabla('tabla-productos',
        ['Imagen', 'Nombre', 'Precio', 'Stock', 'Estado', 'Acciones'],
        productos.map(p => el('tr', {},
            el('td', {}, el('img', { class: 'miniatura', src: '/' + p.imagen, alt: p.nombre, onerror: (e) => { e.target.style.visibility = 'hidden'; } })),
            el('td', {}, el('strong', { textContent: p.nombre }), el('br'), el('small', { textContent: p.categoria }),
                p.promocion ? [el('br'), el('span', { class: 'chip chip-disponible', textContent: p.promocion.texto })] : null),
            el('td', {},
                p.precioFinal < p.precio
                    ? [el('s', { textContent: pesos.format(p.precio) }), ' ', el('strong', { textContent: pesos.format(p.precioFinal) })]
                    : pesos.format(p.precio)),
            el('td', { textContent: String(p.stock) }),
            el('td', {}, etiquetaEstadoProducto(p)),
            el('td', { class: 'acciones-celda' },
                el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Editar', onclick: () => editarProducto(p.id) }),
                el('button', {
                    type: 'button',
                    class: 'admin-boton pequeno secundario',
                    textContent: p.estado === 'inactivo' ? 'Mostrar' : 'Ocultar',
                    onclick: () => cambiarVisibilidad(p)
                }),
                el('button', {
                    type: 'button',
                    class: 'admin-boton pequeno secundario',
                    textContent: 'Eliminar',
                    onclick: () => eliminarProducto(p)
                }))
        )));
}

/** Muestra la foto actual (o la elegida) en la vista previa del formulario. */
function mostrarVistaFoto(src) {
    const vista = $('vista-foto');
    vista.src = src ?? '';
    vista.classList.toggle('oculto', !src);
}

function llenarFormularioProducto(p = null) {
    const f = $('form-producto');
    f.reset();
    estado.productoEditandoId = p ? p.id : null;
    $('titulo-form-producto').textContent = p ? `Editar: ${p.nombre}` : 'Nuevo producto';
    mostrarVistaFoto(p?.imagen ? '/' + p.imagen : null);
    if (p) {
        f.nombre.value = p.nombre;
        f.descripcion.value = p.descripcion;
        f.imagen.value = p.imagen;
        f.precio.value = p.precio;
        f.medida.value = p.medida;
        f.categoria.value = p.categoria;
        f.stock.value = p.stock;
        f.popular.checked = p.popular;
        f.activo.checked = p.estado !== 'inactivo';
    }
}

function editarProducto(id) {
    const p = estado.productos.find(x => x.id === id);
    if (!p) return;
    llenarFormularioProducto(p);
    $('form-producto').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function eliminarProducto(p) {
    if (!await confirmar({ titulo: 'Eliminar producto', mensajes: [`¿Eliminar «${p.nombre}»? Los pedidos ya hechos se conservan.`], aceptar: 'Eliminar' })) return;
    try {
        await api(`/admin/productos/${p.id}`, { metodo: 'DELETE' });
        avisar(`«${p.nombre}» eliminado.`, 'ok');
        if (estado.productoEditandoId === p.id) llenarFormularioProducto(null);
        await cargarProductos();
    } catch (error) {
        await informar({ titulo: 'No se pudo eliminar', mensajes: [error.message] });
    }
}

async function cambiarVisibilidad(p) {
    const ocultar = p.estado !== 'inactivo';
    try {
        await api(`/admin/productos/${p.id}`, { metodo: 'PUT', cuerpo: { estado: ocultar ? 'inactivo' : 'disponible' } });
        avisar(ocultar ? `«${p.nombre}» ya no aparece en la tienda.` : `«${p.nombre}» volvió a la tienda.`, 'ok');
        await cargarProductos();
    } catch (error) {
        avisar(error.message);
    }
}

function datosDelFormularioProducto(f) {
    const numero = (valor) => valor === '' ? null : Number(valor);
    return {
        nombre: f.nombre.value.trim(),
        descripcion: f.descripcion.value.trim(),
        imagen: f.imagen.value.trim(),
        precio: numero(f.precio.value),
        medida: f.medida.value.trim(),
        categoria: f.categoria.value.trim(),
        stock: numero(f.stock.value) ?? 0,
        popular: f.popular.checked,
        estado: f.activo.checked ? 'disponible' : 'inactivo'
    };
}

/** Envía la foto elegida en el computador; el servidor la guarda y actualiza el producto. */
async function subirFotoProducto(id, archivo) {
    const respuesta = await fetch(`/api/admin/productos/${id}/imagen`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': archivo.type },
        body: archivo
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo subir la foto.');
}

async function guardarProducto(evento) {
    evento.preventDefault();
    const cuerpo = datosDelFormularioProducto($('form-producto'));
    const archivo = $('archivo-foto').files[0];
    try {
        let id = estado.productoEditandoId;
        if (id) {
            await api(`/admin/productos/${id}`, { metodo: 'PUT', cuerpo });
        } else {
            const { producto } = await api('/admin/productos', { metodo: 'POST', cuerpo });
            id = producto.id;
        }
        if (archivo) await subirFotoProducto(id, archivo);
        avisar(estado.productoEditandoId ? 'Producto actualizado.' : 'Producto creado.', 'ok');
        llenarFormularioProducto(null);
        await cargarProductos();
    } catch (error) {
        avisar(error.message);
        await cargarProductos().catch(() => {});
    }
}

/* ---------- Pedidos ---------- */

const ETIQUETAS_METODO_WEB = { contra_entrega: 'Contra entrega', transferencia: 'Transferencia', manual: 'Pago manual' };

function celdaPago(p) {
    if (p.origen !== 'tienda') {
        return ETIQUETAS_METODO_WEB[p.metodoPago] ?? p.metodoPago;
    }
    const partes = [ETIQUETAS_FORMA_PAGO[p.formaPago] ?? p.formaPago];
    if (p.formaPago === 'efectivo') partes.push(`Recibido ${pesos.format(p.pagoRecibido)} · Cambio ${pesos.format(p.cambio)}`);
    return el('span', {}, partes[0], el('br'), el('small', { textContent: partes[1] ?? '' }));
}

async function cargarPedidos() {
    const { pedidos } = await api('/pedidos');
    tabla('tabla-pedidos',
        ['Nº', 'Fecha', 'Origen', 'Cliente', 'Vendedor', 'Artículos', 'Total', 'Pago', 'Estado', 'Acciones'],
        pedidos.map(p => el('tr', {},
            el('td', {}, `#${p.id}`,
                p.facturaNumero ? [el('br'), el('small', {}, p.facturaNumero, ' · ',
                    el('a', { href: `/api/pedidos/${p.id}/factura`, target: '_blank', rel: 'noopener', textContent: 'PDF' }))] : null),
            el('td', { textContent: fecha.format(aFecha(p.creadoEn)) }),
            el('td', { textContent: p.origen === 'tienda' ? 'Tienda' : 'Web' }),
            el('td', { textContent: p.cliente }),
            el('td', { textContent: p.vendedor ?? '—' }),
            el('td', { textContent: p.items.map(i => `${i.cantidad} × ${i.nombre}`).join(', ') }),
            el('td', { textContent: pesos.format(p.total) }),
            el('td', {}, celdaPago(p)),
            el('td', {}, el('span', { class: `chip chip-${p.estado}`, textContent: ETIQUETAS_PEDIDO[p.estado] ?? p.estado })),
            el('td', { class: 'acciones-celda' }, p.estado === 'pendiente_pago'
                ? [
                    el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Completar', onclick: () => cambiarEstadoPedido(p.id, 'completado') }),
                    el('button', { type: 'button', class: 'admin-boton pequeno secundario', textContent: 'Cancelar', onclick: () => cambiarEstadoPedido(p.id, 'cancelado') })
                ]
                : el('small', { textContent: 'Sin acciones' }), botonGenerarFactura(p, cargarPedidos)))
        ));
}

async function cambiarEstadoPedido(id, nuevo) {
    const texto = nuevo === 'cancelado'
        ? `¿Cancelar el pedido #${id}? Las unidades volverán al inventario.`
        : `¿Marcar el pedido #${id} como completado?`;
    if (!await confirmar({ titulo: 'Confirmar', mensajes: [texto], aceptar: nuevo === 'cancelado' ? 'Cancelar pedido' : 'Completar' })) return;
    try {
        await api(`/admin/pedidos/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado: nuevo } });
        avisar(`Pedido #${id} actualizado.`, 'ok');
        await cargarPedidos();
    } catch (error) {
        avisar(error.message);
    }
}

/* ---------- Turnos ---------- */

async function cargarTurnos() {
    const [{ turnos }, { vendedores, catalogo }] = await Promise.all([
        api('/admin/turnos'),
        api('/admin/vendedores')
    ]);
    estado.turnos = turnos;
    estado.vendedoresActivos = vendedores.filter(v => v.activo);
    estado.catalogoPermisos = catalogo;

    tabla('tabla-turnos',
        ['Turno', 'Horario', 'Estado', 'Acciones'],
        turnos.map(t => el('tr', {},
            el('td', { textContent: t.nombre }),
            el('td', { textContent: `${t.horaInicio} – ${t.horaFin}` }),
            el('td', {}, el('span', { class: `chip ${t.activo ? 'chip-disponible' : 'chip-inactivo'}`, textContent: t.activo ? 'Activo' : 'Inactivo' })),
            el('td', { class: 'acciones-celda' },
                el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Editar', onclick: () => llenarFormularioTurno(t) })))));

    llenarOpcionesAsignacion();
    await cargarAsignaciones();
}

function llenarFormularioTurno(t = null) {
    const f = $('form-turno');
    f.reset();
    estado.turnoEditandoId = t ? t.id : null;
    $('titulo-form-turno').textContent = t ? `Editar turno: ${t.nombre}` : 'Nuevo turno';
    if (t) {
        f.nombre.value = t.nombre;
        f.horaInicio.value = t.horaInicio;
        f.horaFin.value = t.horaFin;
        f.activo.checked = t.activo;
    } else {
        f.activo.checked = true;
    }
}

async function guardarTurno(evento) {
    evento.preventDefault();
    const f = $('form-turno');
    const cuerpo = {
        nombre: f.nombre.value.trim(),
        horaInicio: f.horaInicio.value,
        horaFin: f.horaFin.value,
        activo: f.activo.checked
    };
    try {
        if (estado.turnoEditandoId) {
            await api(`/admin/turnos/${estado.turnoEditandoId}`, { metodo: 'PUT', cuerpo });
            avisar('Turno actualizado. Los vendedores con turnos futuros recibieron el aviso.', 'ok');
        } else {
            await api('/admin/turnos', { metodo: 'POST', cuerpo });
            avisar('Turno creado.', 'ok');
        }
        llenarFormularioTurno(null);
        await cargarTurnos();
    } catch (error) {
        avisar(error.message);
    }
}

function llenarOpcionesAsignacion() {
    const selectVendedor = $('asig-vendedor');
    const selectTurno = $('asig-turno');
    const valorVendedor = selectVendedor.value;
    const valorTurno = selectTurno.value;

    selectVendedor.replaceChildren(
        el('option', { value: '', textContent: estado.vendedoresActivos.length ? 'Elige un vendedor' : 'No hay vendedores activos' }),
        ...estado.vendedoresActivos.map(v => el('option', { value: String(v.id), textContent: `${v.nombre} (${v.email})` })));
    selectTurno.replaceChildren(
        el('option', { value: '', textContent: 'Elige un turno' }),
        ...estado.turnos.filter(t => t.activo).map(t =>
            el('option', { value: String(t.id), textContent: `${t.nombre} (${t.horaInicio} – ${t.horaFin})` })));

    selectVendedor.value = valorVendedor;
    selectTurno.value = valorTurno;
    const campoFecha = $('asig-fecha');
    campoFecha.min = fechaDeHoy();
    if (!campoFecha.value) campoFecha.value = fechaDeHoy();
}

/** Fecha YYYY-MM-DD desplazada n días (sin pasar por la zona horaria del navegador). */
function desplazarFecha(fecha, dias) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

async function cargarAsignaciones() {
    const hoy = fechaDeHoy();
    if (!$('asig-desde').value) $('asig-desde').value = desplazarFecha(hoy, -7);
    if (!$('asig-hasta').value) $('asig-hasta').value = desplazarFecha(hoy, 14);
    const { asignaciones } = await api(`/admin/asignaciones?desde=${$('asig-desde').value}&hasta=${$('asig-hasta').value}`);
    tabla('tabla-asignaciones',
        ['Fecha', 'Vendedor', 'Turno', 'Horario', 'Acciones'],
        asignaciones.map(a => el('tr', {},
            el('td', { textContent: a.fecha }),
            el('td', { textContent: a.vendedor }),
            el('td', { textContent: a.turno }),
            el('td', { textContent: `${a.horaInicio} – ${a.horaFin}` }),
            el('td', { class: 'acciones-celda' }, a.fecha < hoy
                ? el('span', { class: 'chip', textContent: 'Pasada' })
                : el('button', {
                    type: 'button',
                    class: 'admin-boton pequeno secundario',
                    textContent: 'Quitar',
                    onclick: () => quitarAsignacion(a)
                })))));
}

async function asignarTurno(evento) {
    evento.preventDefault();
    const f = $('form-asignacion');
    try {
        await api('/admin/asignaciones', {
            metodo: 'POST',
            cuerpo: { usuarioId: Number(f.vendedor.value), turnoId: Number(f.turno.value), fecha: f.fecha.value }
        });
        avisar('Turno asignado. El vendedor recibió el aviso en su perfil.', 'ok');
        await cargarAsignaciones();
    } catch (error) {
        avisar(error.message);
    }
}

async function quitarAsignacion(a) {
    if (!await confirmar({ titulo: 'Quitar turno', mensajes: [`¿Quitar el turno de ${a.vendedor} el ${a.fecha}?`], aceptar: 'Quitar' })) return;
    try {
        await api(`/admin/asignaciones/${a.id}`, { metodo: 'DELETE' });
        avisar('Asignación quitada.', 'ok');
        await cargarAsignaciones();
    } catch (error) {
        await informar({ titulo: 'No se pudo quitar el turno', mensajes: [error.message] });
    }
}

/* ---------- Vendedores y permisos ---------- */

async function cargarVendedores() {
    const { vendedores, catalogo } = await api('/admin/vendedores');
    estado.catalogoPermisos = catalogo;
    const claves = Object.keys(catalogo);

    tabla('tabla-vendedores',
        ['Vendedor', 'Correo', 'Permisos adicionales (por defecto solo vender)', 'Acciones'],
        vendedores.map(v => {
            const casillas = claves.map(clave => {
                const check = el('input', { type: 'checkbox', value: clave, checked: v.permisos.includes(clave) });
                return el('label', { class: 'admin-check' }, check, ' ', catalogo[clave]);
            });
            const boton = el('button', { type: 'button', class: 'admin-boton pequeno', textContent: 'Guardar permisos' });
            boton.addEventListener('click', () => {
                const marcados = [...boton.parentElement.parentElement.querySelectorAll('input[type=checkbox]')]
                    .filter(c => c.checked).map(c => c.value);
                guardarPermisos(v, marcados);
            });
            return el('tr', {},
                el('td', { textContent: v.nombre + (v.activo ? '' : ' (suspendido)') }),
                el('td', { textContent: v.email }),
                el('td', { class: 'permisos-lista' }, casillas),
                el('td', { class: 'acciones-celda' }, boton));
        }));
}

async function guardarPermisos(vendedor, permisos) {
    try {
        await api(`/admin/vendedores/${vendedor.id}/permisos`, { metodo: 'PUT', cuerpo: { permisos } });
        avisar(`Permisos de ${vendedor.nombre} guardados. Recibirá un aviso en su perfil.`, 'ok');
    } catch (error) {
        avisar(error.message);
        await cargarVendedores();
    }
}

/* ---------- Jornadas (asistencia) ---------- */

async function cargarJornadas() {
    const campo = $('jornadas-fecha');
    if (!campo.value) campo.value = fechaDeHoy();
    const { jornadas } = await api(`/admin/jornadas?fecha=${encodeURIComponent(campo.value)}`);
    tabla('tabla-jornadas',
        ['Vendedor', 'Turno', 'Entrada', 'Salida', 'Estado'],
        jornadas.map(j => el('tr', {},
            el('td', { textContent: j.vendedor }),
            el('td', { textContent: j.turno ?? '—' }),
            el('td', { textContent: horaLocal(j.entradaEn) }),
            el('td', { textContent: j.salidaEn ? horaLocal(j.salidaEn) : '—' }),
            el('td', {}, el('span', {
                class: `chip ${j.salidaEn ? 'chip-completado' : 'chip-disponible'}`,
                textContent: j.salidaEn ? 'Cerrada' : 'En turno'
            })))));
}

/* ---------- Usuarios ---------- */

async function cargarUsuarios() {
    const { usuarios } = await api('/admin/usuarios');
    const roles = ['superadmin', 'vendedor', 'cliente'];
    const nombresRol = { superadmin: 'Superadministrador', vendedor: 'Vendedor', cliente: 'Cliente' };
    tabla('tabla-usuarios',
        ['Nombre', 'Correo', 'Rol', 'Activo'],
        usuarios.map(u => {
            const esYo = u.id === estado.usuario.id;
            const selectRol = el('select', { disabled: esYo, title: esYo ? 'No puedes cambiar tu propio rol' : '' },
                roles.map(r => el('option', { value: r, selected: r === u.rol, textContent: nombresRol[r] })));
            selectRol.addEventListener('change', () => cambiarUsuario(u.id, { rol: selectRol.value }));
            const check = el('input', { type: 'checkbox', checked: u.activo, disabled: esYo });
            check.addEventListener('change', () => cambiarUsuario(u.id, { activo: check.checked }));
            return el('tr', {},
                el('td', { textContent: u.nombre + (esYo ? ' (tú)' : '') }),
                el('td', { textContent: u.email }),
                el('td', {}, selectRol),
                el('td', {}, check));
        }));
}

async function cambiarUsuario(id, cambios) {
    try {
        await api(`/admin/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios });
        avisar('Cuenta actualizada.', 'ok');
    } catch (error) {
        avisar(error.message);
        await cargarUsuarios();
    }
}

/* ---------- Auditoría ---------- */

async function cargarAuditoria() {
    const { registros } = await api('/admin/auditoria');
    tabla('tabla-auditoria',
        ['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle'],
        registros.map(r => el('tr', {},
            el('td', { textContent: fecha.format(aFecha(r.creado_en)) }),
            el('td', { textContent: r.usuario_email ?? 'Sistema' }),
            el('td', { textContent: r.accion.replaceAll('_', ' ') }),
            el('td', { textContent: `${r.entidad} ${r.entidad_id ?? ''}`.trim() }),
            el('td', { class: 'detalle', textContent: r.detalle ? JSON.stringify(r.detalle) : '' }))));
}

/* ---------- navegación y arranque ---------- */

/** Llena el filtro de turnos una sola vez con los turnos fijos (Mañana, Tarde, Noche). */
let turnosFiltroListos = false;
async function cargarTurnosFiltro() {
    if (turnosFiltroListos) return;
    const { turnos } = await api('/admin/turnos');
    $('facturas-turno').append(...turnos.map(t => el('option', { value: t.id, textContent: t.nombre })));
    turnosFiltroListos = true;
}

const cargarPedidosWeb = montarPedidosWeb({ avisar, nombreUsuario: () => estado.usuario.nombre });
const venta = montarVenta({ avisar, puedeVender: () => true });

const CARGADORES = {
    'pedidos-web': cargarPedidosWeb,
    venta: () => venta.cargar(),
    resumen: cargarResumen,
    productos: cargarProductos,
    promociones: () => promociones.cargar(),
    pedidos: cargarPedidos,
    facturas: async () => { await cargarTurnosFiltro(); return cargarFacturasGuardadas($('facturas-alcance').value, $('facturas-turno').value); },
    turnos: cargarTurnos,
    vendedores: cargarVendedores,
    jornadas: cargarJornadas,
    usuarios: cargarUsuarios,
    auditoria: cargarAuditoria,
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

function bloquearPanel() {
    document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
    $('sec-cambio').classList.remove('oculto');
    document.querySelectorAll('[data-seccion]').forEach(b => { b.disabled = true; });
}

async function enviarCambioPassword(evento) {
    evento.preventDefault();
    const f = evento.target;
    if (f.nueva.value !== f.confirmar.value) {
        avisar('La nueva contraseña y su repetición no coinciden.');
        return;
    }
    try {
        await api('/auth/cambiar-password', {
            metodo: 'POST',
            cuerpo: { actual: f.actual.value, nueva: f.nueva.value }
        });
        avisar('Contraseña actualizada. Ya puedes usar el panel.', 'ok');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        avisar(error.message);
    }
}

async function iniciar() {
    montarMenuMovil(document.querySelector('.admin-menu-toggle'), document.querySelector('.admin-menu'));
    try {
        const { usuario } = await api('/auth/me');
        estado.usuario = usuario;
    } catch {
        location.replace('index_login.html');
        return;
    }

    if (estado.usuario.rol !== 'superadmin') {
        $('admin-cargando').textContent = 'Este panel es solo para el superadministrador. Redirigiendo a la tienda…';
        setTimeout(() => location.replace('index.html'), 2000);
        return;
    }

    $('admin-cargando').remove();
    $('admin-app').classList.remove('oculto');
    $('admin-usuario').textContent = estado.usuario.nombre;

    document.querySelectorAll('[data-seccion]').forEach(b =>
        b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)));
    $('admin-salir').addEventListener('click', async () => {
        await api('/auth/logout', { metodo: 'POST' }).catch(() => {});
        location.replace('index.html');
    });
    $('form-producto').addEventListener('submit', guardarProducto);
    $('archivo-foto').addEventListener('change', (evento) => {
        const archivo = evento.target.files[0];
        mostrarVistaFoto(archivo ? URL.createObjectURL(archivo) : null);
    });
    $('cancelar-producto').addEventListener('click', () => llenarFormularioProducto(null));
    promociones.iniciar();
    $('form-turno').addEventListener('submit', guardarTurno);
    $('cancelar-turno').addEventListener('click', () => llenarFormularioTurno(null));
    $('form-asignacion').addEventListener('submit', asignarTurno);
    ['asig-desde', 'asig-hasta'].forEach(id => $(id).addEventListener('change', () => cargarAsignaciones().catch(e => avisar(e.message))));
    $('jornadas-fecha').addEventListener('change', () => cargarJornadas().catch(e => avisar(e.message)));
    $('facturas-alcance').addEventListener('change', () => cargarFacturasGuardadas($('facturas-alcance').value, $('facturas-turno').value).catch(e => avisar(e.message)));
    $('facturas-turno').addEventListener('change', () => cargarFacturasGuardadas($('facturas-alcance').value, $('facturas-turno').value).catch(e => avisar(e.message)));
    $('form-cambio').addEventListener('submit', enviarCambioPassword);
    venta.iniciar();

    if (estado.usuario.debeCambiarPassword) {
        bloquearPanel();
        return;
    }
    mostrarSeccion(location.hash === '#perfil' ? 'perfil' : 'resumen');
}

iniciar();
