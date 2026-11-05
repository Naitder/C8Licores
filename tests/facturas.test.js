/**
 * Pruebas de integración: pago por transferencia en la compra web, factura pedida
 * después de la compra, IVA y permisos de factura.
 * Base SQLite en memoria. Ejecutar con: npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, PASSWORD_ADMIN_POR_DEFECTO } from '../server/src/config.js';
import { inicializarBaseDatos } from '../server/src/db/inicializar.js';
import { crearApp } from '../server/src/app.js';

const VERIF = { fechaNacimiento: '1990-05-10', identificacion: '1085000000' };

const config = { ...CONFIG, DB_PATH: ':memory:', SESION_HORAS: 1, EMPRESA: { ...CONFIG.EMPRESA, cuentaTransferencia: 'Bancolombia 123-456789' } };

let db;
let servidor;
let base;
let sidAdmin;
let sidCliente;
let sidOtro;
let idProducto;
let pedidoSinFactura;

async function api(ruta, { metodo = 'GET', cuerpo, sid } = {}) {
    const cabeceras = {};
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (sid) cabeceras.Cookie = `sid=${sid}`;
    const res = await fetch(base + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const tipo = res.headers.get('content-type') ?? '';
    const datos = tipo.includes('application/pdf') ? await res.arrayBuffer() : await res.json().catch(() => null);
    const sidNueva = (res.headers.get('set-cookie') ?? '').match(/sid=([^;]+)/)?.[1];
    return { status: res.status, datos, tipo, sid: sidNueva };
}

before(async () => {
    db = inicializarBaseDatos(config);
    servidor = crearApp({ db, config }).listen(0);
    await new Promise(resolver => servidor.once('listening', resolver));
    base = `http://127.0.0.1:${servidor.address().port}`;

    const login = await api('/api/auth/login', {
        metodo: 'POST',
        cuerpo: { identificador: config.ADMIN_EMAIL, password: PASSWORD_ADMIN_POR_DEFECTO }
    });
    sidAdmin = login.sid;
    await api('/api/auth/cambiar-password', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { actual: PASSWORD_ADMIN_POR_DEFECTO, nueva: 'Nueva1234*' }
    });

    const producto = await api('/api/admin/productos', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Aguardiente Factura', precio: 50000, stock: 20 }
    });
    idProducto = producto.datos.producto.id;

    const cliente = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Cliente Web', email: 'web@ejemplo.com', password: 'Cliente1234*', confirmPassword: 'Cliente1234*', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    sidCliente = cliente.sid;
    const otro = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Otro Web', email: 'otro-web@ejemplo.com', password: 'Cliente1234*', confirmPassword: 'Cliente1234*', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    sidOtro = otro.sid;
});

after(() => {
    servidor.close();
    db.close();
});

test('la compra web acepta transferencia y muestra la cuenta para pagar', async () => {
    const r = await api('/api/pedidos', {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 1 # 2-3', metodoPago: 'transferencia' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.datos.pedido.cuentaTransferencia, 'Bancolombia 123-456789');
    assert.equal(r.datos.pedido.metodoPago, 'transferencia');
    pedidoSinFactura = r.datos.pedido.id;
});

test('el IVA del 19% se suma al valor y queda guardado en el pedido', async () => {
    const pedido = await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidCliente });
    assert.equal(pedido.datos.pedido.total, 59500);   // 50.000 + 19%
    assert.equal(pedido.datos.pedido.iva, 9500);
});

test('toda compra tiene factura interna aunque el cliente no la pida', async () => {
    const pedido = await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidCliente });
    assert.match(pedido.datos.pedido.facturaNumero, /^FV-\d{6}$/);
    assert.equal(pedido.datos.pedido.facturaPedidaPorCliente, false);
    const pdf = await api(`/api/pedidos/${pedidoSinFactura}/factura`, { sid: sidCliente });
    assert.equal(pdf.status, 200);
});

test('el comprador pide que la factura salga con sus datos; el número no cambia', async () => {
    const antes = (await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidCliente })).datos.pedido.facturaNumero;
    const pide = await api(`/api/pedidos/${pedidoSinFactura}/factura`, {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { nombre: 'Cliente Web Gómez', identificacion: '1085000000' }
    });
    assert.equal(pide.status, 201);
    assert.equal(pide.datos.creada, false);
    assert.equal(pide.datos.actualizada, true);
    assert.equal(pide.datos.numero, antes);

    const pedido = await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidCliente });
    assert.equal(pedido.datos.pedido.facturaPedidaPorCliente, true);

    const pdf = await api(`/api/pedidos/${pedidoSinFactura}/factura`, { sid: sidCliente });
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(pdf.datos).subarray(0, 5).toString('latin1'), '%PDF-');
});

test('pedir la factura otra vez no reemplaza la existente', async () => {
    const otra = await api(`/api/pedidos/${pedidoSinFactura}/factura`, {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { nombre: 'Nombre Distinto', identificacion: '999999999' }
    });
    assert.equal(otra.status, 201);
    assert.equal(otra.datos.creada, false);
    const pedido = await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidCliente });
    assert.equal(pedido.datos.pedido.facturaNumero, (await api(`/api/pedidos/${pedidoSinFactura}`, { sid: sidAdmin })).datos.pedido.facturaNumero);
});

test('otro cliente no puede pedir ni descargar la factura de este pedido', async () => {
    const pide = await api(`/api/pedidos/${pedidoSinFactura}/factura`, {
        metodo: 'POST', sid: sidOtro,
        cuerpo: { nombre: 'Intruso Web', identificacion: '123456' }
    });
    assert.equal(pide.status, 404);
    const pdf = await api(`/api/pedidos/${pedidoSinFactura}/factura`, { sid: sidOtro });
    assert.equal(pdf.status, 404);
});

test('el administrador puede poner los datos del cliente en cualquier factura web', async () => {
    const compra = await api('/api/pedidos', {
        metodo: 'POST', sid: sidOtro,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 2 }], direccion: 'Carrera 5 # 6-7', metodoPago: 'contra_entrega' }
    });
    assert.match(compra.datos.pedido.facturaNumero, /^FV-\d{6}$/);
    const pide = await api(`/api/pedidos/${compra.datos.pedido.id}/factura`, {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Otro Web Pérez', identificacion: '5555555' }
    });
    assert.equal(pide.status, 201);
    assert.equal(pide.datos.numero, compra.datos.pedido.facturaNumero);
    assert.equal(pide.datos.actualizada, true);
});

test('menores de 18 años no pueden comprar, ni en la web ni en tienda', async () => {
    const menor = { fechaNacimiento: '2012-01-01', identificacion: '1085000000' };
    const web = await api('/api/pedidos', {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { verificacion: menor, items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 1 # 2-3', metodoPago: 'contra_entrega' }
    });
    assert.equal(web.status, 400);
    assert.ok(web.datos.detalles.verificacionFecha);

    const tienda = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { verificacion: menor, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'tarjeta' }
    });
    assert.equal(tienda.status, 400);
    assert.ok(tienda.datos.detalles.verificacionFecha);
});

test('la cédula de la verificación es obligatoria y solo números', async () => {
    const r = await api('/api/pedidos', {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { verificacion: { fechaNacimiento: '1990-05-10', identificacion: '10-85' }, items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 1 # 2-3', metodoPago: 'contra_entrega' }
    });
    assert.equal(r.status, 400);
    assert.ok(r.datos.detalles.verificacionIdentificacion);
});

test('el listado de facturas guardadas: el cliente no tiene acceso; el administrador ve todas o las propias', async () => {
    const cliente = await api('/api/facturas', { sid: sidCliente });
    assert.equal(cliente.status, 403);

    const todas = await api('/api/facturas?alcance=todas', { sid: sidAdmin });
    assert.equal(todas.status, 200);
    assert.ok(todas.datos.resumen.cantidad >= 2);
    assert.ok(todas.datos.facturas.every(f => /^FV-\d{6}$/.test(f.numero)));

    const venta = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], formaPago: 'tarjeta' }
    });
    assert.equal(venta.status, 201);

    const propias = await api('/api/facturas?alcance=propias', { sid: sidAdmin });
    assert.equal(propias.status, 200);
    assert.equal(propias.datos.resumen.cantidad, 1); // solo la venta en tienda que registró el administrador
    assert.equal(propias.datos.facturas[0].origen, 'tienda');
    assert.equal(propias.datos.facturas[0].cliente, 'Consumidor final');
});

test('la factura exige datos válidos del cliente', async () => {
    const compra = await api('/api/pedidos', {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 9 # 9-9', metodoPago: 'contra_entrega' }
    });
    const pide = await api(`/api/pedidos/${compra.datos.pedido.id}/factura`, {
        metodo: 'POST', sid: sidCliente,
        cuerpo: { nombre: 'Jo', identificacion: '1 2' }
    });
    assert.equal(pide.status, 400);
    assert.ok(pide.datos.detalles.facturaNombre);
    assert.ok(pide.datos.detalles.facturaIdentificacion);
});

test('la compra web puede llevar la factura desde el inicio', async () => {
    const r = await api('/api/pedidos', {
        metodo: 'POST', sid: sidCliente,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idProducto, cantidad: 1 }], direccion: 'Calle 2 # 3-4', metodoPago: 'contra_entrega',
            factura: { nombre: 'Cliente Web Gómez', identificacion: '1085000000' }
        }
    });
    assert.equal(r.status, 201);
    assert.match(r.datos.pedido.facturaNumero, /^FV-\d{6}$/);
});
