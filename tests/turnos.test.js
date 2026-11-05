/**
 * Pruebas de integración: turnos, asistencia, permisos de vendedor,
 * notificaciones y ventas en tienda. Base SQLite en memoria.
 * Ejecutar con:  npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, PASSWORD_ADMIN_POR_DEFECTO } from '../server/src/config.js';
import { inicializarBaseDatos } from '../server/src/db/inicializar.js';
import { crearApp } from '../server/src/app.js';

const VERIF = { fechaNacimiento: '1990-05-10', identificacion: '1085000000' };

const config = { ...CONFIG, DB_PATH: ':memory:', SESION_HORAS: 1 };
const PASS_ADMIN = 'Nueva1234*';
const PASS_VENDEDOR = 'Vendedor1234*';

let db;
let servidor;
let base;
let sidAdmin;
let sidVendedor;
let idVendedor;
let idManana;
let idProducto;
let precioProducto;

async function api(ruta, { metodo = 'GET', cuerpo, sid } = {}) {
    const cabeceras = {};
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (sid) cabeceras.Cookie = `sid=${sid}`;
    const res = await fetch(base + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await res.json().catch(() => null);
    const cookie = res.headers.get('set-cookie') ?? '';
    const sidNueva = cookie.match(/sid=([^;]+)/)?.[1];
    return { status: res.status, datos, sid: sidNueva };
}

/** Fecha de hoy en la hora local (la misma que usa SQLite con 'localtime'). */
function hoy() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

before(async () => {
    db = inicializarBaseDatos(config);
    servidor = crearApp({ db, config }).listen(0);
    await new Promise(resolver => servidor.once('listening', resolver));
    base = `http://127.0.0.1:${servidor.address().port}`;

    // Superadministrador: cambia la contraseña temporal.
    const login = await api('/api/auth/login', {
        metodo: 'POST',
        cuerpo: { identificador: config.ADMIN_EMAIL, password: PASSWORD_ADMIN_POR_DEFECTO }
    });
    sidAdmin = login.sid;
    await api('/api/auth/cambiar-password', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { actual: PASSWORD_ADMIN_POR_DEFECTO, nueva: PASS_ADMIN }
    });

    // Cliente que luego el administrador convierte en vendedora.
    const registro = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Ana Vendedora', email: 'ana@ejemplo.com', password: PASS_VENDEDOR, confirmPassword: PASS_VENDEDOR, fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    idVendedor = registro.datos.usuario.id;
    const promocion = await api(`/api/admin/usuarios/${idVendedor}`, {
        metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'vendedor' }
    });
    assert.equal(promocion.status, 200);

    const turnos = await api('/api/admin/turnos', { sid: sidAdmin });
    idManana = turnos.datos.turnos.find(t => t.nombre === 'Mañana').id;

    const productos = await api('/api/admin/productos', { sid: sidAdmin });
    idProducto = productos.datos.productos[0].id;
    precioProducto = productos.datos.productos[0].precioFinal;
    await api(`/api/admin/productos/${idProducto}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { stock: 10 }
    });

    const login2 = await api('/api/auth/login', {
        metodo: 'POST', cuerpo: { identificador: 'ana@ejemplo.com', password: PASS_VENDEDOR }
    });
    sidVendedor = login2.sid;
});

after(() => {
    servidor.close();
    db.close();
});

test('las migraciones 1 a 8 quedan aplicadas y existen los 3 turnos fijos', () => {
    const versiones = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(f => f.version);
    assert.deepEqual(versiones, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM turnos').get().n, 3);
});

test('un vendedor no puede entrar a rutas de administración', async () => {
    const r = await api('/api/admin/resumen', { sid: sidVendedor });
    assert.equal(r.status, 403);
});

test('sin turno asignado para hoy, la entrada se rechaza', async () => {
    const r = await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidVendedor });
    assert.equal(r.status, 409);
    assert.match(r.datos.error, /turno asignado para hoy/);
});

test('el administrador asigna Mañana a la vendedora hoy y ella recibe el aviso en su perfil', async () => {
    const r = await api('/api/admin/asignaciones', {
        metodo: 'POST', sid: sidAdmin, cuerpo: { usuarioId: idVendedor, turnoId: idManana, fecha: hoy() }
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.asignacion.turno, 'Mañana');

    const notis = await api('/api/notificaciones', { sid: sidVendedor });
    assert.ok(notis.datos.notificaciones.some(n => n.mensaje.includes('Te asignaron el turno')));
    // Dos avisos sin leer: el del cambio de rol a vendedora y el del turno.
    assert.equal(notis.datos.noLeidas, 2);
});

test('no se puede asignar un turno en una fecha pasada', async () => {
    const r = await api('/api/admin/asignaciones', {
        metodo: 'POST', sid: sidAdmin, cuerpo: { usuarioId: idVendedor, turnoId: idManana, fecha: '2000-01-01' }
    });
    assert.equal(r.status, 409);
});

test('la vendedora marca entrada, no puede volver a marcarla y la venta queda habilitada', async () => {
    const entrada = await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidVendedor });
    assert.equal(entrada.status, 200);
    assert.ok(entrada.datos.jornadaActiva.entradaEn);
    assert.equal(entrada.datos.jornadaActiva.turno, 'Mañana');

    const repetida = await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidVendedor });
    assert.equal(repetida.status, 409);
});

test('venta en efectivo: calcula el cambio y descuenta stock', async () => {
    const total = Math.round(precioProducto * 2 * 1.19); // base + IVA 19%
    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidVendedor,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 2 }], formaPago: 'efectivo', pagoRecibido: total + 1000 }
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.venta.total, total);
    assert.equal(r.datos.venta.cambio, 1000);
    assert.equal(r.datos.venta.origen, 'tienda');
    assert.equal(r.datos.venta.estado, 'completado');
    assert.equal(r.datos.venta.turno, 'Mañana');
    assert.equal(r.datos.venta.vendedor, 'Ana Vendedora');

    const producto = db.prepare('SELECT stock FROM productos WHERE id = ?').get(idProducto);
    assert.equal(producto.stock, 8);
});

test('venta en efectivo con dinero insuficiente se rechaza y no toca el stock', async () => {
    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidVendedor,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'efectivo', pagoRecibido: 1 }
    });
    assert.equal(r.status, 400);
    assert.ok(r.datos.detalles.pagoRecibido);
    assert.equal(db.prepare('SELECT stock FROM productos WHERE id = ?').get(idProducto).stock, 8);
});

test('venta con tarjeta cobra el total exacto y no hay cambio', async () => {
    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidVendedor,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'tarjeta' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.venta.formaPago, 'tarjeta');
    assert.equal(r.datos.venta.pagoRecibido, Math.round(precioProducto * 1.19));
    assert.equal(r.datos.venta.cambio, 0);
});

test('sin permiso, el vendedor no puede cambiar el precio de un producto', async () => {
    const r = await api(`/api/vendedor/productos/${idProducto}`, {
        metodo: 'PATCH', sid: sidVendedor, cuerpo: { precio: 99999 }
    });
    assert.equal(r.status, 403);
    assert.match(r.datos.error, /Cambiar precios/);
});

test('con permiso de precios el vendedor sí lo cambia, y no puede tocar el stock sin su permiso', async () => {
    const concedido = await api(`/api/admin/vendedores/${idVendedor}/permisos`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { permisos: ['editar_precios'] }
    });
    assert.equal(concedido.status, 200);

    const precio = await api(`/api/vendedor/productos/${idProducto}`, {
        metodo: 'PATCH', sid: sidVendedor, cuerpo: { precio: precioProducto + 500 }
    });
    assert.equal(precio.status, 200);
    assert.equal(precio.datos.producto.precio, precioProducto + 500);

    const stock = await api(`/api/vendedor/productos/${idProducto}`, {
        metodo: 'PATCH', sid: sidVendedor, cuerpo: { stock: 100 }
    });
    assert.equal(stock.status, 403);
});

test('un campo que el vendedor no conoce se rechaza aunque tenga permisos', async () => {
    const r = await api(`/api/vendedor/productos/${idProducto}`, {
        metodo: 'PATCH', sid: sidVendedor, cuerpo: { precio: 1000, categoria_secreta: 'x' }
    });
    assert.equal(r.status, 400);
});

test('el cambio de horario de un turno asignado notifica a la vendedora', async () => {
    const r = await api(`/api/admin/turnos/${idManana}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { horaInicio: '07:00' }
    });
    assert.equal(r.status, 200);
    assert.equal(r.datos.turno.horaInicio, '07:00');

    const notis = await api('/api/notificaciones', { sid: sidVendedor });
    assert.ok(notis.datos.notificaciones.some(n => n.mensaje.includes('de 07:00 a 14:00')));
});

test('un turno con hora de fin anterior o igual a la de inicio se rechaza', async () => {
    const r = await api(`/api/admin/turnos/${idManana}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { horaInicio: '15:00', horaFin: '14:00' }
    });
    assert.equal(r.status, 400);
    assert.ok(r.datos.detalles.horaFin);
});

test('la vendedora marca salida y ya no puede vender', async () => {
    const salida = await api('/api/vendedor/jornada/salida', { metodo: 'POST', sid: sidVendedor });
    assert.equal(salida.status, 200);
    assert.equal(salida.datos.jornadaActiva, null);

    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidVendedor,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'transferencia' }
    });
    assert.equal(r.status, 409);
});

test('el administrador ve la venta de tienda con vendedor, turno y forma de pago en pedidos', async () => {
    const r = await api('/api/pedidos', { sid: sidAdmin });
    const tienda = r.datos.pedidos.find(p => p.origen === 'tienda');
    assert.ok(tienda);
    assert.equal(tienda.cliente, 'Venta en tienda');
    assert.equal(tienda.vendedor, 'Ana Vendedora');
    assert.ok(['efectivo', 'tarjeta'].includes(tienda.formaPago));
});

test('quitar a la vendedora el rol de vendedor le retira sus permisos y turnos futuros', async () => {
    const r = await api(`/api/admin/usuarios/${idVendedor}`, {
        metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'cliente' }
    });
    assert.equal(r.status, 200);

    const permisos = db.prepare('SELECT COUNT(*) AS n FROM permisos_usuario WHERE usuario_id = ?').get(idVendedor).n;
    const asignaciones = db.prepare('SELECT COUNT(*) AS n FROM asignaciones_turno WHERE usuario_id = ?').get(idVendedor).n;
    assert.equal(permisos, 0);
    assert.equal(asignaciones, 0);
});
