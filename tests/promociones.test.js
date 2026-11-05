/**
 * Pruebas de integración: promociones (porcentaje, monto y NxM), cotización,
 * efecto de ocultar productos y facturas estándar en PDF.
 * Base SQLite en memoria. Ejecutar con: npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, PASSWORD_ADMIN_POR_DEFECTO } from '../server/src/config.js';
import { inicializarBaseDatos } from '../server/src/db/inicializar.js';
import { crearApp } from '../server/src/app.js';

const VERIF = { fechaNacimiento: '1990-05-10', identificacion: '1085000000' };

const config = { ...CONFIG, DB_PATH: ':memory:', SESION_HORAS: 1 };
const PASS_ADMIN = 'Nueva1234*';

let db;
let servidor;
let base;
let sidAdmin;
let idRon;
let idPromoPorcentaje;

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
        cuerpo: { actual: PASSWORD_ADMIN_POR_DEFECTO, nueva: PASS_ADMIN }
    });

    const ron = await api('/api/admin/productos', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { nombre: 'Ron Promo', precio: 40000, stock: 10 }
    });
    idRon = ron.datos.producto.id;
});

after(() => {
    servidor.close();
    db.close();
});

test('la migración 3 deja la tabla de promociones y de facturas', () => {
    const versiones = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(f => f.version);
    assert.deepEqual(versiones, [1, 2, 3, 4, 5, 6, 7, 8]);
    const tablas = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
    assert.ok(tablas.includes('promociones') && tablas.includes('facturas'));
});

test('reglas de promociones: se rechazan los valores que no tienen sentido', async () => {
    const montoMayorQue = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: 'Mal', tipo: 'monto', valor: 50000 }
    });
    assert.equal(montoMayorQue.status, 400);

    const porcentajeInvalido = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: 'Mal', tipo: 'porcentaje', valor: 150 }
    });
    assert.equal(porcentajeInvalido.status, 400);

    const nxmInvalido = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: 'Mal', tipo: 'nxm', lleva: 1, paga: 2 }
    });
    assert.equal(nxmInvalido.status, 400);
    assert.ok(nxmInvalido.datos.detalles.paga);
});

test('un producto solo puede tener una promoción activa a la vez', async () => {
    const crea = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: '25% de descuento', tipo: 'porcentaje', valor: 25 }
    });
    assert.equal(crea.status, 201);
    idPromoPorcentaje = crea.datos.promocion.id;

    const segunda = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: '2x1', tipo: 'nxm', lleva: 2, paga: 1 }
    });
    assert.equal(segunda.status, 409);

    const inactiva = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: '2x1', tipo: 'nxm', lleva: 2, paga: 1, activa: false }
    });
    assert.equal(inactiva.status, 201);
});

test('la cotización es pública y aplica el descuento porcentual: 25% sobre 3 unidades', async () => {
    const r = await api('/api/pedidos/cotizacion', {
        metodo: 'POST', cuerpo: { verificacion: VERIF, items: [{ productoId: idRon, cantidad: 3 }] }
    });
    assert.equal(r.status, 200);
    assert.equal(r.datos.cotizacion.total, 107100, '90.000 + IVA 19%');
    assert.equal(r.datos.cotizacion.subtotal, 90000);
    assert.equal(r.datos.cotizacion.descuento, 30000);
    assert.equal(r.datos.cotizacion.disponible, true);
});

test('cambiar la promoción a NxM (2x1) cambia el precio en el catálogo y en la cotización', async () => {
    const desactiva = await api(`/api/promociones/${idPromoPorcentaje}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { activa: false }
    });
    assert.equal(desactiva.status, 200);

    const lista = await api('/api/promociones', { sid: sidAdmin });
    const dosXuno = lista.datos.promociones.find(p => p.tipo === 'nxm' && !p.activa);
    const activa = await api(`/api/promociones/${dosXuno.id}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { activa: true }
    });
    assert.equal(activa.status, 200);
    assert.equal(activa.datos.promocion.texto, '2x1');

    const catalogo = await api('/api/productos');
    const ron = catalogo.datos.productos.find(p => p.id === idRon);
    assert.equal(ron.precioFinal, 40000, 'NxM no rebaja el precio unitario');
    assert.equal(ron.promocion.texto, '2x1');

    // 3 unidades con 2x1: se llevan 3 y se pagan 2.
    const r = await api('/api/pedidos/cotizacion', {
        metodo: 'POST', cuerpo: { verificacion: VERIF, items: [{ productoId: idRon, cantidad: 3 }] }
    });
    assert.equal(r.datos.cotizacion.total, 95200, '80.000 + IVA 19%');
    assert.equal(r.datos.cotizacion.descuento, 40000);
});

test('el cambio de precio de una promoción de monto se refleja en el catálogo', async () => {
    const lista = await api('/api/promociones', { sid: sidAdmin });
    const dosXuno = lista.datos.promociones.find(p => p.tipo === 'nxm' && p.activa);
    await api(`/api/promociones/${dosXuno.id}`, { metodo: 'PUT', sid: sidAdmin, cuerpo: { activa: false } });
    const monto = await api('/api/promociones', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { productoId: idRon, nombre: 'Rebaja', tipo: 'monto', valor: 4000 }
    });
    assert.equal(monto.status, 201);

    const catalogo = await api('/api/productos');
    assert.equal(catalogo.datos.productos.find(p => p.id === idRon).precioFinal, 36000);
});

test('ocultar un producto lo quita de la tienda y no se puede cotizar', async () => {
    const oculta = await api(`/api/admin/productos/${idRon}`, {
        metodo: 'PUT', sid: sidAdmin, cuerpo: { estado: 'inactivo' }
    });
    assert.equal(oculta.status, 200);

    const catalogo = await api('/api/productos');
    assert.equal(catalogo.datos.productos.some(p => p.id === idRon), false);

    const cotiza = await api('/api/pedidos/cotizacion', {
        metodo: 'POST', cuerpo: { verificacion: VERIF, items: [{ productoId: idRon, cantidad: 1 }] }
    });
    assert.equal(cotiza.status, 409);

    await api(`/api/admin/productos/${idRon}`, { metodo: 'PUT', sid: sidAdmin, cuerpo: { estado: 'disponible' } });
});

test('venta en tienda con factura: aplica la promoción y genera el PDF', async () => {
    const venta = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idRon, cantidad: 2 }],
            formaPago: 'tarjeta',
            factura: { nombre: 'Juan Pérez Gómez', identificacion: '1234567890' }
        }
    });
    assert.equal(venta.status, 201);
    // La promoción activa en este punto es la de monto ($4.000 menos por unidad): 2 × 36.000.
    assert.equal(venta.datos.venta.total, 85680, '72.000 + IVA 19%');
    assert.match(venta.datos.venta.facturaNumero, /^FV-\d{6}$/);

    const pdf = await api(`/api/pedidos/${venta.datos.venta.id}/factura`, { sid: sidAdmin });
    assert.equal(pdf.status, 200);
    assert.match(pdf.tipo, /application\/pdf/);
    const cabecera = Buffer.from(pdf.datos).subarray(0, 5).toString('latin1');
    assert.equal(cabecera, '%PDF-');
});

test('la factura exige nombre e identificación válidos', async () => {
    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idRon, cantidad: 1 }],
            formaPago: 'tarjeta',
            factura: { nombre: 'Jo', identificacion: '12 34' }
        }
    });
    assert.equal(r.status, 400);
    assert.ok(r.datos.detalles.facturaNombre);
    assert.ok(r.datos.detalles.facturaIdentificacion);
});

test('una venta sin pedido de factura igual tiene factura interna', async () => {
    const r = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: { verificacion: VERIF, items: [{ productoId: idRon, cantidad: 1 }], formaPago: 'efectivo', pagoRecibido: 50000 }
    });
    assert.equal(r.status, 201);
    assert.match(r.datos.venta.facturaNumero, /^FV-\d{6}$/);

    const pdf = await api(`/api/pedidos/${r.datos.venta.id}/factura`, { sid: sidAdmin });
    assert.equal(pdf.status, 200);
});

test('un cliente no puede descargar la factura de otra persona', async () => {
    const reg = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Otro Cliente', email: 'otro@ejemplo.com', password: 'Cliente1234*', confirmPassword: 'Cliente1234*', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    const venta = await api('/api/vendedor/ventas', {
        metodo: 'POST', sid: sidAdmin,
        cuerpo: {
            verificacion: VERIF, items: [{ productoId: idRon, cantidad: 1 }],
            formaPago: 'tarjeta',
            factura: { nombre: 'Ana Ruiz', identificacion: '99887766' }
        }
    });
    const ajena = await api(`/api/pedidos/${venta.datos.venta.id}/factura`, { sid: reg.sid });
    assert.equal(ajena.status, 404);
});

test('solo quien tiene el permiso puede cambiar promociones; los clientes no pueden', async () => {
    const reg = await api('/api/auth/registro', {
        metodo: 'POST',
        cuerpo: { nombre: 'Cliente Curioso', email: 'curioso@ejemplo.com', password: 'Cliente1234*', confirmPassword: 'Cliente1234*', fechaNacimiento: '1990-05-10', identificacion: '1085000000' }
    });
    const r = await api('/api/promociones', {
        metodo: 'POST', sid: reg.sid,
        cuerpo: { productoId: idRon, nombre: 'Gratis', tipo: 'porcentaje', valor: 99 }
    });
    assert.equal(r.status, 403);
});
