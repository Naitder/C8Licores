/**
 * Pruebas de integración de la API (base SQLite en memoria, sin navegador).
 * Ejecutar con:  npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, PASSWORD_ADMIN_POR_DEFECTO } from '../server/src/config.js';
import { inicializarBaseDatos } from '../server/src/db/inicializar.js';
import { sembrarDatos } from '../server/src/db/seed.js';
import { crearApp } from '../server/src/app.js';

const VERIF = { fechaNacimiento: '1990-05-10', identificacion: '1085000000' };

const config = { ...CONFIG, DB_PATH: ':memory:', SESION_HORAS: 1 };
const EMAIL_ADMIN = config.ADMIN_EMAIL;
const PASS_NUEVA_ADMIN = 'Nueva1234*';

let db;
let servidor;
let base;
let sidAdmin;
let sidCliente;
let idAdmin;
let idProductoPrueba;
let idPedido;

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

before(async () => {
    db = inicializarBaseDatos(config);
    servidor = crearApp({ db, config }).listen(0);
    await new Promise(resolver => servidor.once('listening', resolver));
    base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
    servidor.close();
    db.close();
});

test('la carga inicial inserta los 9 artículos del JSON y no los duplica', async () => {
    const r = await api('/api/productos');
    assert.equal(r.status, 200);
    assert.equal(r.datos.productos.length, 9);
    assert.equal(r.datos.productos[0].imagen, 'img/Catalogo/Ron_Viejo_de_Caldas.png');
    assert.equal(sembrarDatos(db, config).productosNuevos, 0);
});

test('el superadministrador inicial debe cambiar su contraseña antes de usar el panel', async () => {
    const login = await api('/api/auth/login', {
        metodo: 'POST',
        cuerpo: { identificador: EMAIL_ADMIN, password: PASSWORD_ADMIN_POR_DEFECTO }
    });
    assert.equal(login.status, 200);
    assert.equal(login.datos.usuario.rol, 'superadmin');
    assert.equal(login.datos.usuario.debeCambiarPassword, true);
    sidAdmin = login.sid;
    idAdmin = login.datos.usuario.id;

    assert.equal((await api('/api/admin/usuarios', { sid: sidAdmin })).status, 403);

    const cambio = await api('/api/auth/cambiar-password', {
        metodo: 'POST',
        sid: sidAdmin,
        cuerpo: { actual: PASSWORD_ADMIN_POR_DEFECTO, nueva: PASS_NUEVA_ADMIN }
    });
    assert.equal(cambio.status, 200);
    assert.equal((await api('/api/admin/usuarios', { sid: sidAdmin })).status, 200);
});

test('un cliente se registra y no puede entrar al panel administrativo', async () => {
    const r = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Ana', email: 'ana@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.usuario.rol, 'cliente');
    sidCliente = r.sid;

    assert.equal((await api('/api/admin/usuarios', { sid: sidCliente })).status, 403);
    assert.equal((await api('/api/admin/productos', { sid: sidCliente })).status, 403);
    assert.equal((await api('/api/admin/auditoria', { sid: sidCliente })).status, 403);
    assert.equal((await api('/api/admin/usuarios')).status, 401);
});

test('el registro valida datos y rechaza correos repetidos', async () => {
    const malo = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: '', email: 'no-es-correo', password: '123', confirmPassword: '456' }
    });
    assert.equal(malo.status, 400);
    assert.ok(malo.datos.detalles.email && malo.datos.detalles.password && malo.datos.detalles.confirmPassword);

    const repetido = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Otra', email: 'ANA@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    assert.equal(repetido.status, 409);
});

test('nadie puede cambiar su propio rol ni un cliente escalar privilegios', async () => {
    const propio = await api(`/api/admin/usuarios/${idAdmin}`, {
        metodo: 'PATCH', sid: sidAdmin, cuerpo: { rol: 'cliente' }
    });
    assert.equal(propio.status, 403);

    const yo = await api('/api/auth/me', { sid: sidCliente });
    const escalar = await api(`/api/admin/usuarios/${yo.datos.usuario.id}`, {
        metodo: 'PATCH', sid: sidCliente, cuerpo: { rol: 'superadmin' }
    });
    assert.equal(escalar.status, 403);
});

test('el administrador crea productos y el servidor valida precios', async () => {
    const invalido = await api('/api/admin/productos', {
        metodo: 'POST',
        sid: sidAdmin,
        cuerpo: { nombre: 'Ron X', precio: -1000 }
    });
    assert.equal(invalido.status, 400);

    const crea = await api('/api/admin/productos', {
        metodo: 'POST',
        sid: sidAdmin,
        cuerpo: { nombre: 'Ron de Prueba', precio: 40000, categoria: 'Ron', stock: 5 }
    });
    assert.equal(crea.status, 201);
    assert.equal(crea.datos.producto.estado, 'disponible');
    assert.equal(crea.datos.producto.precioFinal, 40000);
    assert.equal(crea.datos.producto.promocion, null);
    idProductoPrueba = crea.datos.producto.id;

    // El precio rebajado ahora es una promoción de monto ($5.000 de descuento).
    const promo = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idProductoPrueba, nombre: 'Oferta de prueba', tipo: 'monto', valor: 5000 }
    });
    assert.equal(promo.status, 201);
    const lista = await api('/api/productos');
    assert.equal(lista.datos.productos.find(p => p.id === idProductoPrueba).precioFinal, 35000);
});

test('la compra descuenta inventario y no permite vender más de lo existente', async () => {
    const compra = await api('/api/pedidos', {
        metodo: 'POST',
        sid: sidCliente,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idProductoPrueba, cantidad: 2 }],
            direccion: 'Calle 1 # 2-3, Mocoa',
            metodoPago: 'contra_entrega'
        }
    });
    assert.equal(compra.status, 201);
    assert.equal(compra.datos.pedido.total, 83300, '70.000 + 19% de IVA');
    assert.equal(compra.datos.pedido.estado, 'pendiente_pago');
    idPedido = compra.datos.pedido.id;

    assert.equal((await api(`/api/productos/${idProductoPrueba}`)).datos.producto.stock, 3);

    const excede = await api('/api/pedidos', {
        metodo: 'POST',
        sid: sidCliente,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idProductoPrueba, cantidad: 4 }],
            direccion: 'Calle 1 # 2-3, Mocoa'
        }
    });
    assert.equal(excede.status, 409);
    assert.equal((await api(`/api/productos/${idProductoPrueba}`)).datos.producto.stock, 3);
});

test('cancelar un pedido devuelve las unidades al inventario', async () => {
    const r = await api(`/api/admin/pedidos/${idPedido}/estado`, {
        metodo: 'PATCH', sid: sidAdmin, cuerpo: { estado: 'cancelado' }
    });
    assert.equal(r.status, 200);
    assert.equal((await api(`/api/productos/${idProductoPrueba}`)).datos.producto.stock, 5);

    const reactivar = await api(`/api/admin/pedidos/${idPedido}/estado`, {
        metodo: 'PATCH', sid: sidAdmin, cuerpo: { estado: 'completado' }
    });
    assert.equal(reactivar.status, 409);
});

test('un cliente solo ve sus propios pedidos', async () => {
    const otro = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Luis', email: 'luis@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    const ajeno = await api(`/api/pedidos/${idPedido}`, { sid: otro.sid });
    assert.equal(ajeno.status, 404);

    const misPedidos = await api('/api/pedidos', { sid: otro.sid });
    assert.equal(misPedidos.datos.pedidos.length, 0);
});

test('un producto inactivo desaparece del catálogo y no se puede comprar', async () => {
    const r = await api(`/api/admin/productos/${idProductoPrueba}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { estado: 'inactivo' }
    });
    assert.equal(r.status, 200);
    assert.equal(r.datos.producto.estado, 'inactivo');

    const catalogo = await api('/api/productos');
    assert.equal(catalogo.datos.productos.some(p => p.id === idProductoPrueba), false);
    assert.equal((await api(`/api/productos/${idProductoPrueba}`)).status, 404);

    const compra = await api('/api/pedidos', {
        metodo: 'POST',
        sid: sidCliente,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProductoPrueba, cantidad: 1 }], direccion: 'Calle 1 # 2-3, Mocoa' }
    });
    assert.equal(compra.status, 409);
});

test('la auditoría registra los cambios administrativos con antes y después', async () => {
    const r = await api('/api/admin/auditoria', { sid: sidAdmin });
    const cambio = r.datos.registros.find(x => x.accion === 'actualizar' && x.entidad_id === String(idProductoPrueba));
    assert.ok(cambio, 'debe existir un registro de actualización del producto');
    assert.deepEqual(cambio.detalle.estado, { antes: 'disponible', despues: 'inactivo' });
});

test('cerrar sesión invalida el token', async () => {
    const salida = await api('/api/auth/logout', { metodo: 'POST', sid: sidCliente });
    assert.equal(salida.status, 200);
    assert.equal((await api('/api/auth/me', { sid: sidCliente })).status, 401);
});

test('el servidor publica el frontend pero no expone código ni la base de datos', async () => {
    const inicio = await fetch(base + '/');
    assert.equal(inicio.status, 200);
    assert.match(await inicio.text(), /C8LICORES/);

    assert.equal((await fetch(base + '/server/src/config.js')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/data/c8licores.db')).status, 404);
});

test('el registro pide fecha de nacimiento y cédula, rechaza menores y guarda los datos en la cuenta', async () => {
    const sinDatos = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Sin Datos', email: 'sin-datos@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123' }
    });
    assert.equal(sinDatos.status, 400);
    assert.ok(sinDatos.datos.detalles.fechaNacimiento && sinDatos.datos.detalles.identificacion);

    const menor = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Menor', email: 'menor@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123',
            fechaNacimiento: '2015-01-01', identificacion: '1085000001' }
    });
    assert.equal(menor.status, 400);
    assert.ok(menor.datos.detalles.fechaNacimiento);

    const ok = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Mayor Datos', email: 'mayor-datos@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123',
            fechaNacimiento: '1990-05-10', identificacion: '1085000002' }
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.datos.usuario.identificacion, undefined, 'la cédula no viaja en la sesión');

    const perfil = await api('/api/auth/perfil', { sid: ok.sid });
    assert.equal(perfil.status, 200);
    assert.equal(perfil.datos.perfil.fechaNacimiento, '1990-05-10');
    assert.equal(perfil.datos.perfil.identificacion, '1085000002');

    const cambio = await api('/api/auth/perfil', { metodo: 'PUT', sid: ok.sid,
        cuerpo: { nombre: 'Mayor Cambiado', telefono: '300 123 4567' } });
    assert.equal(cambio.status, 200);
    assert.equal(cambio.datos.perfil.nombre, 'Mayor Cambiado');
    assert.equal(cambio.datos.perfil.telefono, '3001234567');
    assert.equal(cambio.datos.perfil.identificacionBloqueada, true);

    // Fecha y cédula ya registradas: no cambian desde el perfil.
    const bloqueado = await api('/api/auth/perfil', { metodo: 'PUT', sid: ok.sid,
        cuerpo: { fechaNacimiento: '1991-02-02', identificacion: '1085000003' } });
    assert.equal(bloqueado.status, 400);
    assert.ok(bloqueado.datos.detalles.fechaNacimiento && bloqueado.datos.detalles.identificacion);

    assert.equal((await api('/api/auth/perfil')).status, 401);
});

test('guardados, mis pedidos y aviso al administrador con el celular del cliente', async () => {
    const nuevo = await api('/api/admin/productos', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Ron Guardado', precio: 30000, stock: 10, estado: 'disponible' }
    });
    const idProducto = nuevo.datos.producto.id;
    const reg = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Celular Cliente', email: 'celular@correo.com', password: 'Cliente123', confirmPassword: 'Cliente123',
            fechaNacimiento: '1990-05-10', identificacion: '1085000009' }
    });
    const sid = reg.sid;
    await api('/api/auth/perfil', { metodo: 'PUT', sid, cuerpo: { telefono: '3001112233' } });

    const guardar = await api('/api/favoritos', { metodo: 'POST', sid, cuerpo: { productoId: idProducto } });
    assert.equal(guardar.status, 201);
    const guardados = await api('/api/favoritos', { sid });
    assert.ok(guardados.datos.favoritos.some(f => f.id === idProducto));
    await api(`/api/favoritos/${idProducto}`, { metodo: 'DELETE', sid });
    assert.equal((await api('/api/favoritos', { sid })).datos.favoritos.length, 0);

    const compra = await api('/api/pedidos', {
        metodo: 'POST', sid,
        cuerpo: { items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 1 # 2-3',
            metodoPago: 'contra_entrega', verificacion: VERIF }
    });
    assert.equal(compra.status, 201);

    const mios = await api('/api/pedidos/mios', { sid });
    assert.equal(mios.datos.pedidos.length, 1);
    assert.equal(mios.datos.pedidos[0].clienteTelefono, '3001112233');

    const avisos = await api('/api/notificaciones', { sid: sidAdmin });
    const aviso = avisos.datos.notificaciones.find(n => n.mensaje.includes(`#${compra.datos.pedido.id}`));
    assert.ok(aviso, 'el administrador debe recibir el aviso del pedido');
    assert.ok(aviso.mensaje.includes('3001112233'), 'el aviso lleva el celular de contacto');

    assert.equal((await api('/api/favoritos')).status, 401);
});
