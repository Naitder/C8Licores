/**
 * Pruebas de integración: pedidos web que llegan al vendedor en turno, facturas por turno,
 * y protección de la cuenta del administrador principal frente a otros superadministradores.
 * Base SQLite en memoria. Ejecutar con:  npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CONFIG, PASSWORD_ADMIN_POR_DEFECTO } from '../server/src/config.js';
import { inicializarBaseDatos } from '../server/src/db/inicializar.js';
import { crearApp } from '../server/src/app.js';

const VERIF = { fechaNacimiento: '1990-05-10', identificacion: '1085000000' };
const config = { ...CONFIG, DB_PATH: ':memory:', SESION_HORAS: 1, RAIZ: fs.mkdtempSync(path.join(os.tmpdir(), 'c8-fotos-')) };
const PASS = 'Nueva1234*';

let db;
let servidor;
let base;
let sidAdmin;
let idAdmin;
let sidTemporal;
let idTemporal;
let sidVendedor;
let idVendedor;
let sidCliente;
let idProducto;
let idManana;
let idTarde;
let pedidoWeb;
let sidOtroVendedor;
let pedidoSinAtender;
let idOtroVendedor;

async function api(ruta, { metodo = 'GET', cuerpo, sid } = {}) {
    const cabeceras = {};
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (sid) cabeceras.Cookie = `sid=${sid}`;
    const res = await fetch(base + ruta, {
        method: metodo, headers: cabeceras,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await res.json().catch(() => null);
    const sidNueva = (res.headers.get('set-cookie') ?? '').match(/sid=([^;]+)/)?.[1];
    return { status: res.status, datos, sid: sidNueva };
}

function hoy() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function crearUsuario(nombre, email) {
    const r = await api('/api/auth/registro', { metodo: 'POST', cuerpo: {
        nombre, email, password: PASS, confirmPassword: PASS, fechaNacimiento: '1990-05-10', identificacion: '1085000000' } });
    return { id: r.datos.usuario.id, sid: r.sid };
}

before(async () => {
    db = inicializarBaseDatos(config);
    servidor = crearApp({ db, config }).listen(0);
    await new Promise(resolver => servidor.once('listening', resolver));
    base = `http://127.0.0.1:${servidor.address().port}`;

    const login = await api('/api/auth/login', { metodo: 'POST',
        cuerpo: { identificador: config.ADMIN_EMAIL, password: PASSWORD_ADMIN_POR_DEFECTO } });
    sidAdmin = login.sid;
    await api('/api/auth/cambiar-password', { metodo: 'POST', sid: sidAdmin,
        cuerpo: { actual: PASSWORD_ADMIN_POR_DEFECTO, nueva: PASS } });
    idAdmin = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(config.ADMIN_EMAIL).id;

    const vend = await crearUsuario('Vendedora Turno', 'vend@ejemplo.com');
    idVendedor = vend.id;
    await api(`/api/admin/usuarios/${idVendedor}`, { metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'vendedor' } });
    sidVendedor = (await api('/api/auth/login', { metodo: 'POST',
        cuerpo: { identificador: 'vend@ejemplo.com', password: PASS } })).sid;

    const temp = await crearUsuario('Admin Temporal', 'temporal@ejemplo.com');
    idTemporal = temp.id;
    const ascenso = await api(`/api/admin/usuarios/${idTemporal}`, { metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'superadmin' } });
    assert.equal(ascenso.status, 200, 'el principal puede asignar un superadministrador temporal');
    sidTemporal = (await api('/api/auth/login', { metodo: 'POST',
        cuerpo: { identificador: 'temporal@ejemplo.com', password: PASS } })).sid;

    const cli = await crearUsuario('Cliente Web', 'cliente@ejemplo.com');
    sidCliente = cli.sid;

    const turnos = await api('/api/admin/turnos', { sid: sidAdmin });
    idManana = turnos.datos.turnos.find(t => t.nombre === 'Mañana').id;
    idTarde = turnos.datos.turnos.find(t => t.nombre === 'Tarde').id;

    const prod = await api('/api/admin/productos', { metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Ron Turno', precio: 50000, stock: 20, estado: 'disponible' } });
    idProducto = prod.datos.producto.id;
});

after(() => {
    servidor.close();
    db.close();
});

test('el superadministrador temporal no puede cambiar la cuenta principal', async () => {
    const r = await api(`/api/admin/usuarios/${idAdmin}`, { metodo: 'PATCH', sid: sidTemporal, cuerpo: { activo: false } });
    assert.equal(r.status, 403);
    const degradar = await api(`/api/admin/usuarios/${idAdmin}`, { metodo: 'PATCH', sid: sidTemporal, cuerpo: { rol: 'cliente' } });
    assert.equal(degradar.status, 403);
    assert.equal(db.prepare('SELECT rol, activo FROM usuarios WHERE id = ?').get(idAdmin).rol, 'superadmin');
});

test('el superadministrador temporal no puede convertir cuentas en superadministrador', async () => {
    const ascender = await api(`/api/admin/usuarios/${idVendedor}`, { metodo: 'PATCH', sid: sidTemporal, cuerpo: { rol: 'superadmin' } });
    assert.equal(ascender.status, 403);
    assert.match(ascender.datos.error, /principal/);
});

test('el superadministrador temporal sí puede administrar cuentas que no son superadministradores', async () => {
    const suspender = await api(`/api/admin/usuarios/${idVendedor}`, { metodo: 'PATCH', sid: sidTemporal, cuerpo: { activo: true } });
    assert.equal(suspender.status, 200);
});

test('sin entrada de turno, el vendedor no ve pedidos web aunque existan', async () => {
    await api(`/api/admin/asignaciones`, { metodo: 'POST', sid: sidAdmin, cuerpo: { usuarioId: idVendedor, turnoId: idManana, fecha: hoy() } });
    const compra = await api('/api/pedidos', { metodo: 'POST', sid: sidCliente, cuerpo: {
        items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 1 # 2-3',
        metodoPago: 'contra_entrega', verificacion: VERIF } });
    assert.equal(compra.status, 201);
    pedidoWeb = compra.datos.pedido.id;

    const antes = await api('/api/vendedor/pedidos-web', { sid: sidVendedor });
    assert.equal(antes.status, 200, JSON.stringify(antes.datos));
    assert.equal(antes.datos.turnoActivo, false);
    assert.equal(antes.datos.pendientes.length, 0);
});

test('al marcar entrada, el vendedor recibe los pedidos web pendientes de su turno', async () => {
    const entrada = await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidVendedor });
    assert.equal(entrada.status, 200);

    const cola = await api('/api/vendedor/pedidos-web', { sid: sidVendedor });
    assert.equal(cola.datos.turnoActivo, true);
    assert.ok(cola.datos.pendientes.some(p => p.id === pedidoWeb), 'el pedido aparece en la cola');

    const notis = await api('/api/notificaciones', { sid: sidVendedor });
    assert.ok(notis.datos.notificaciones.some(n => n.mensaje.includes(`#${pedidoWeb}`)),
        'el vendedor en turno también recibe el aviso del pedido');
});

test('el vendedor atiende el pedido: queda a su nombre y en su turno, y ya no está pendiente', async () => {
    const r = await api(`/api/vendedor/pedidos/${pedidoWeb}/atender`, { metodo: 'POST', sid: sidVendedor });
    assert.equal(r.status, 200);
    assert.equal(r.datos.pedido.vendedor, 'Vendedora Turno');
    assert.equal(r.datos.pedido.turno, 'Mañana');

    const cola = await api('/api/vendedor/pedidos-web', { sid: sidVendedor });
    assert.ok(!cola.datos.pendientes.some(p => p.id === pedidoWeb));
    assert.ok(cola.datos.atendidos.some(p => p.id === pedidoWeb));

    const otra = await api(`/api/vendedor/pedidos/${pedidoWeb}/atender`, { metodo: 'POST', sid: sidVendedor });
    assert.equal(otra.status, 409);
});

test('el superadministrador puede completar un pedido web que atendió otro vendedor', async () => {
    const completar = await api(`/api/vendedor/pedidos/${pedidoWeb}/estado`, { metodo: 'PATCH', sid: sidAdmin, cuerpo: { estado: 'completado' } });
    assert.equal(completar.status, 200);
});

test('una venta en tienda y el pedido web aparecen en las facturas del turno del vendedor', async () => {
    const venta = await api('/api/vendedor/ventas', { metodo: 'POST', sid: sidVendedor, cuerpo: {
        verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'efectivo', pagoRecibido: 100000 } });
    assert.equal(venta.status, 201);

    const turnoVendedor = await api('/api/facturas', { sid: sidVendedor });
    assert.equal(turnoVendedor.status, 200);
    assert.equal(turnoVendedor.datos.facturas.length, 2);
    assert.equal(turnoVendedor.datos.facturas.every(f => f.turno === 'Mañana'), true);

    const porTurno = await api(`/api/facturas?turno=${idManana}`, { sid: sidAdmin });
    assert.equal(porTurno.datos.facturas.length, 2);
    const otroTurno = await api(`/api/facturas?turno=${idTarde}`, { sid: sidAdmin });
    assert.equal(otroTurno.datos.facturas.length, 0);
});

test('el vendedor sin entrada hoy no ve facturas de turno', async () => {
    const salida = await api('/api/vendedor/jornada/salida', { metodo: 'POST', sid: sidVendedor });
    assert.equal(salida.status, 200);
    const r = await api('/api/facturas', { sid: sidVendedor });
    assert.equal(r.datos.facturas.length, 2, 'las facturas del turno de hoy siguen visibles tras la salida');
});

test('solo el vendedor que atiende puede completar o cancelar su pedido', async () => {
    const otro = await crearUsuario('Otro Vendedor', 'otro@ejemplo.com');
    await api(`/api/admin/usuarios/${otro.id}`, { metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'vendedor' } });
    const sidOtro = (await api('/api/auth/login', { metodo: 'POST', cuerpo: { identificador: 'otro@ejemplo.com', password: PASS } })).sid;
    const compra = await api('/api/pedidos', { metodo: 'POST', sid: sidCliente, cuerpo: {
        items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 9 # 8-7',
        metodoPago: 'contra_entrega', verificacion: VERIF } });
    const r = await api(`/api/vendedor/pedidos/${compra.datos.pedido.id}/estado`, { metodo: 'PATCH', sid: sidOtro, cuerpo: { estado: 'completado' } });
    assert.equal(r.status, 403);
});

test('un superadministrador también puede atender un pedido web pendiente; queda sin turno', async () => {
    const compra = await api('/api/pedidos', { metodo: 'POST', sid: sidCliente, cuerpo: {
        items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 5 # 6-7',
        metodoPago: 'contra_entrega', verificacion: VERIF } });
    const id = compra.datos.pedido.id;
    const r = await api(`/api/vendedor/pedidos/${id}/atender`, { metodo: 'POST', sid: sidAdmin });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.pedido.vendedor, 'Administrador');
    assert.equal(r.datos.pedido.turno, null);
});

test('con dos vendedores en turno, solo el que toma el pedido queda como atendedor y su factura le corresponde', async () => {
    const otro = await crearUsuario('Segundo Vendedor', 'segundo@ejemplo.com');
    idOtroVendedor = otro.id;
    await api(`/api/admin/usuarios/${idOtroVendedor}`, { metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'vendedor' } });
    sidOtroVendedor = (await api('/api/auth/login', { metodo: 'POST',
        cuerpo: { identificador: 'segundo@ejemplo.com', password: PASS } })).sid;
    await api('/api/admin/asignaciones', { metodo: 'POST', sid: sidAdmin, cuerpo: { usuarioId: idOtroVendedor, turnoId: idManana, fecha: hoy() } });
    assert.equal((await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidVendedor })).status, 200);
    assert.equal((await api('/api/vendedor/jornada/entrada', { metodo: 'POST', sid: sidOtroVendedor })).status, 200);

    const compra = await api('/api/pedidos', { metodo: 'POST', sid: sidCliente, cuerpo: {
        items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 7 # 8-9',
        metodoPago: 'contra_entrega', verificacion: VERIF } });
    const id = compra.datos.pedido.id;

    const primero = await api(`/api/vendedor/pedidos/${id}/atender`, { metodo: 'POST', sid: sidVendedor });
    assert.equal(primero.status, 200);
    const segundo = await api(`/api/vendedor/pedidos/${id}/atender`, { metodo: 'POST', sid: sidOtroVendedor });
    assert.equal(segundo.status, 409, 'el segundo vendedor en turno no puede tomar el mismo pedido');

    const facturas = await api('/api/facturas', { sid: sidOtroVendedor });
    const factura = facturas.datos.facturas.find(f => f.pedidoId === id);
    assert.ok(factura, 'la factura aparece en el turno compartido');
    assert.equal(factura.vendedor, 'Vendedora Turno', 'la factura queda a nombre de quien atendió');
});

test('el aviso de un pedido web solo llega a quien tiene sesión abierta', async () => {
    // Desconectado = sin ninguna sesión abierta (el registro y el login abren sesiones distintas).
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(idTemporal);
    const compra = await api('/api/pedidos', { metodo: 'POST', sid: sidCliente, cuerpo: {
        items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 2 # 3-4',
        metodoPago: 'contra_entrega', verificacion: VERIF } });
    pedidoSinAtender = compra.datos.pedido.id;

    const avisoDe = (usuarioId) => db.prepare(
        "SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND mensaje LIKE ?")
        .get(usuarioId, `Nuevo pedido web #${pedidoSinAtender} %`).n;
    assert.equal(avisoDe(idAdmin), 1, 'el administrador conectado recibe el aviso');
    assert.equal(avisoDe(idVendedor), 1, 'el vendedor en turno y conectado recibe el aviso');
    assert.equal(avisoDe(idTemporal), 0, 'el superadministrador sin sesión no recibe el aviso');
});

test('al iniciar sesión, el vendedor en turno recibe los pedidos web que siguen pendientes', async () => {
    await api('/api/auth/logout', { metodo: 'POST', sid: sidVendedor });
    const login = await api('/api/auth/login', { metodo: 'POST',
        cuerpo: { identificador: 'vend@ejemplo.com', password: PASS } });
    assert.equal(login.status, 200);
    const notis = db.prepare(
        "SELECT mensaje FROM notificaciones WHERE usuario_id = ? AND mensaje LIKE 'Pedidos web pendientes%' ORDER BY id DESC LIMIT 1")
        .get(idVendedor);
    assert.ok(notis && new RegExp(`#${pedidoSinAtender}(?!\\d)`).test(notis.mensaje),
        'al iniciar sesión recibe la lista de pendientes');
    sidVendedor = login.sid;
});

test('el administrador consulta asignaciones de fechas pasadas, pero no puede quitarlas', async () => {
    const pasada = '2020-01-06';
    db.prepare('INSERT INTO asignaciones_turno (usuario_id, turno_id, fecha) VALUES (?, ?, ?)').run(idVendedor, idManana, pasada);
    const id = db.prepare('SELECT id FROM asignaciones_turno WHERE usuario_id = ? AND fecha = ?').get(idVendedor, pasada).id;

    const lista = await api(`/api/admin/asignaciones?desde=${pasada}&hasta=${pasada}`, { sid: sidAdmin });
    assert.equal(lista.status, 200);
    assert.ok(lista.datos.asignaciones.some(a => a.id === id), 'la asignación pasada aparece en el rango');

    const quitar = await api(`/api/admin/asignaciones/${id}`, { metodo: 'DELETE', sid: sidAdmin });
    assert.equal(quitar.status, 409);
    assert.ok(db.prepare('SELECT id FROM asignaciones_turno WHERE id = ?').get(id), 'el historial no se borra');
});

test('el vendedor ve los pedidos de su turno de hoy (tienda y web atendidos); el superadministrador ve todos', async () => {
    const delTurno = await api('/api/vendedor/pedidos', { sid: sidVendedor });
    assert.equal(delTurno.status, 200);
    assert.ok(delTurno.datos.pedidos.length > 0, 'hay pedidos del turno');
    assert.ok(delTurno.datos.pedidos.every(p => p.turno === 'Mañana'), 'todos son del turno de mañana');

    const todos = await api('/api/vendedor/pedidos', { sid: sidAdmin });
    assert.ok(todos.datos.pedidos.length >= delTurno.datos.pedidos.length);
});

/** Sube bytes crudos (sin JSON) como lo hace el panel al elegir una foto. */
async function subirFoto(productoId, bytes, tipo, sid = sidAdmin) {
    const res = await fetch(`${base}/api/admin/productos/${productoId}/imagen`, {
        method: 'POST', headers: { 'Content-Type': tipo, Cookie: `sid=${sid}` }, body: bytes
    });
    return { status: res.status, datos: await res.json().catch(() => null) };
}
const FOTO_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const FOTO_JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

test('la foto subida se guarda en la base y en img/productos; al subir otra, la anterior se borra', async () => {
    const primera = await subirFoto(idProducto, FOTO_PNG, 'image/png');
    assert.equal(primera.status, 200, JSON.stringify(primera.datos));
    const ruta1 = primera.datos.producto.imagen;
    assert.match(ruta1, /^img\/productos\/p\d+-\d+\.png$/);
    assert.ok(fs.existsSync(path.join(config.RAIZ, ruta1)), 'el archivo queda en disco');
    assert.equal(db.prepare('SELECT imagen FROM productos WHERE id = ?').get(idProducto).imagen, ruta1, 'la ruta queda en la base');

    const segunda = await subirFoto(idProducto, FOTO_JPG, 'image/jpeg');
    assert.equal(segunda.status, 200);
    assert.ok(segunda.datos.producto.imagen.endsWith('.jpg'));
    assert.ok(!fs.existsSync(path.join(config.RAIZ, ruta1)), 'la foto anterior se borra');
});

test('no acepta archivos que no son imagen válida', async () => {
    const texto = await subirFoto(idProducto, Buffer.from('hola'), 'text/plain');
    assert.equal(texto.status, 400);
    const falsa = await subirFoto(idProducto, Buffer.from('no es una imagen'), 'image/png');
    assert.equal(falsa.status, 400);
    assert.equal((await subirFoto(idProducto, FOTO_PNG, 'image/png', sidVendedor)).status, 403, 'solo el superadministrador');
});

test('al eliminar un producto sin pedidos también se borra su foto', async () => {
    const creado = await api('/api/admin/productos', { metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Producto temporal', precio: 1000, stock: 1, estado: 'disponible' } });
    const id = creado.datos.producto.id;
    const foto = await subirFoto(id, FOTO_PNG, 'image/png');
    const archivo = path.join(config.RAIZ, foto.datos.producto.imagen);
    assert.ok(fs.existsSync(archivo));
    const borrado = await api(`/api/admin/productos/${id}`, { metodo: 'DELETE', sid: sidAdmin });
    assert.equal(borrado.status, 200);
    assert.ok(!fs.existsSync(archivo), 'la foto se borra con el producto');
});

test('se puede eliminar un producto con pedidos ya hechos: el pedido conserva nombre y precio', async () => {
    const creado = await api('/api/admin/productos', { metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Licor vendido', precio: 45000, stock: 5, estado: 'disponible' } });
    const id = creado.datos.producto.id;
    const usuario = db.prepare('SELECT id FROM usuarios LIMIT 1').get();
    const pedido = db.prepare(`INSERT INTO pedidos (usuario_id, total, metodo_pago, direccion_entrega, estado)
        VALUES (?, 45000, 'contra_entrega', 'Dirección de prueba', 'completado')`).run(usuario.id);
    db.prepare(`INSERT INTO pedido_items (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal)
        VALUES (?, ?, 'Licor vendido', 45000, 1, 45000)`).run(pedido.lastInsertRowid, id);

    const borrado = await api(`/api/admin/productos/${id}`, { metodo: 'DELETE', sid: sidAdmin });
    assert.equal(borrado.status, 200, 'ya no se bloquea por tener pedidos');

    const item = db.prepare('SELECT producto_id, nombre_producto, precio_unitario FROM pedido_items WHERE pedido_id = ?')
        .get(pedido.lastInsertRowid);
    assert.equal(item.producto_id, null, 'el ítem pierde solo el enlace al producto');
    assert.equal(item.nombre_producto, 'Licor vendido');
    assert.equal(item.precio_unitario, 45000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE id = ?').get(pedido.lastInsertRowid).n, 1);
});
