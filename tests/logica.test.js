/**
 * Pruebas de la lógica (sin navegador). Ejecutar con:  npm test
 * Son posibles gracias a la inyección de dependencias: se usa
 * AlmacenamientoMemoria en lugar de localStorage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AlmacenamientoMemoria } from '../js/core/AlmacenamientoMemoria.js';
import { AlmacenamientoBase } from '../js/core/AlmacenamientoBase.js';
import { FormateadorPrecio } from '../js/core/FormateadorPrecio.js';
import { Producto } from '../js/modelos/Producto.js';
import { ItemCarrito } from '../js/modelos/ItemCarrito.js';
import { Diapositiva } from '../js/modelos/Diapositiva.js';
import { Levenshtein } from '../js/busqueda/Levenshtein.js';
import { BusquedaSimilitud } from '../js/busqueda/BusquedaSimilitud.js';
import { BusquedaExacta } from '../js/busqueda/BusquedaExacta.js';
import { CarritoServicio } from '../js/servicios/CarritoServicio.js';
import { SesionServicio } from '../js/servicios/SesionServicio.js';
import { FiltroServicio } from '../js/servicios/FiltroServicio.js';
import { ContenedorDependencias } from '../js/app/ContenedorDependencias.js';
import { FuenteDatosMemoria } from '../js/core/FuenteDatosMemoria.js';
import { CLAVES } from '../js/config/Configuracion.js';

const crearContenedor = () => new ContenedorDependencias({
    almacenamiento: new AlmacenamientoMemoria(),
    navegador: { irA() {} },
    documento: null,
    fuenteCatalogo: new FuenteDatosMemoria([]),
    fuenteDiapositivas: new FuenteDatosMemoria([])
});

test('las clases abstractas no se pueden instanciar', () => {
    assert.throws(() => new AlmacenamientoBase(), TypeError);
});

test('Producto acepta "titulo" o "nombre" y encapsula sus datos', () => {
    const p = Producto.desdeJSON({ id: 1, titulo: 'Ron Viejo de Caldas', precio: 58800 });
    assert.equal(p.nombre, 'Ron Viejo de Caldas');
    assert.equal(Producto.desdeJSON({ id: 2, nombre: 'Olmeca' }).nombre, 'Olmeca');
    assert.throws(() => { p.precio = 1; }, TypeError); // no tiene setter
    assert.equal(p.precio, 58800);
});

test('ItemCarrito hereda de Producto y calcula subtotal', () => {
    const item = ItemCarrito.desdeProducto(Producto.desdeJSON({ id: 1, nombre: 'X', precio: 1000 }));
    assert.ok(item instanceof Producto);
    item.incrementar();
    assert.equal(item.subtotal, 2000);
    assert.equal(item.aJSON().cantidad, 2);
});

test('FormateadorPrecio formatea en pesos colombianos', () => {
    const f = new FormateadorPrecio('es-CO', '$');
    assert.equal(f.formatear(58800), '$58.800');
    assert.equal(f.formatear(0), '');
    assert.equal(f.formatearTotal(0), '$0');
});

test('Diapositiva extrae la palabra clave igual que la versión anterior', () => {
    assert.equal(Diapositiva.extraerPalabraClave("BUCHANA'S <br> <span>DELUXE</span>"), 'buchanas');
    assert.equal(new Diapositiva({ titulo: 'RON VIEJO <br> <span>DE CALDAS</span>' }).palabraClave(), 'ron');
});

test('Levenshtein y estrategias de búsqueda', () => {
    assert.equal(Levenshtein.distancia('ron', 'ron'), 0);
    assert.equal(Levenshtein.distancia('gato', 'pato'), 1);
    const lista = [{ titulo: 'Ron Viejo de Caldas' }, { nombre: 'Olmeca Silver' }];
    assert.equal(new BusquedaSimilitud(0.8).filtrar(lista, 'ron').length, 1);
    assert.equal(new BusquedaExacta().filtrar(lista, 'olmeca')[0].nombre, 'Olmeca Silver');
});

test('CarritoServicio: agregar, cantidades, total, persistencia y eventos', () => {
    const almacen = new AlmacenamientoMemoria();
    const carrito = new CarritoServicio(almacen);
    let avisos = 0;
    carrito.suscribir(CarritoServicio.EVENTO_CAMBIO, () => avisos++);

    assert.equal(carrito.agregar({ id: 1, nombre: 'A', precio: 1000 }), true);
    assert.equal(carrito.agregar({ id: 1, nombre: 'A', precio: 1000 }), false); // no duplica
    carrito.incrementar(1);
    assert.equal(carrito.calcularTotal(), 2000);

    const recargado = new CarritoServicio(almacen); // simula recargar la página
    assert.equal(recargado.obtenerItems()[0].cantidad, 2);

    carrito.decrementar(1);
    carrito.decrementar(1); // llega a 0 -> se elimina
    assert.equal(carrito.cantidadProductos, 0);
    assert.equal(avisos, 4);

    carrito.obtenerItems().push('intruso'); // la copia no afecta el estado interno
    assert.equal(carrito.cantidadProductos, 0);
});

test('Compatibilidad: lee carritos guardados con el formato anterior', () => {
    const almacen = new AlmacenamientoMemoria();
    almacen.escribir(CLAVES.CARRITO, JSON.stringify([{ id: 4, nombre: "Buchanan's Deluxe", precio: 90000, cantidad: 3 }]));
    assert.equal(new CarritoServicio(almacen).calcularTotal(), 270000);
});

test('SesionServicio tolera valores corruptos', () => {
    const almacen = new AlmacenamientoMemoria();
    almacen.escribir(CLAVES.SESION, '{roto');
    assert.equal(new SesionServicio(almacen).estaAutenticado(), false);
});

test('Autenticación: usuario demo, registro y validaciones en orden', () => {
    const d = crearContenedor();
    assert.equal(d.autenticacion.iniciarSesion('Admin', '123456').esExito, true);
    assert.equal(d.autenticacion.iniciarSesion('admin@barrilete.com', 'mal').mensaje, 'El usuario/correo o la contraseña son incorrectos.');

    const base = { name: 'Ana', email: 'ana@x.com', password: 'secreto', confirmPassword: 'secreto' };
    assert.equal(d.autenticacion.registrar({ ...base, password: '123', confirmPassword: '123' }).mensaje, 'La contraseña debe tener al menos 6 caracteres.');
    assert.equal(d.autenticacion.registrar({ ...base, confirmPassword: 'otro123' }).mensaje, 'Las contraseñas no coinciden.');
    assert.equal(d.autenticacion.registrar({ ...base, email: 'admin@barrilete.com' }).mensaje, 'Este correo electrónico ya está registrado.');
    assert.equal(d.autenticacion.registrar(base).esExito, true);
    assert.equal(d.sesion.obtener().nombreUsuario, 'Ana');
    assert.equal(d.autenticacion.iniciarSesion('ana@x.com', 'secreto').esExito, true);
    assert.equal(d.autenticacion.registrar(base).mensaje, 'Este correo electrónico ya está registrado.');
});

test('FiltroServicio: pendiente -> activo -> consumido', () => {
    const filtros = new FiltroServicio(new AlmacenamientoMemoria());
    filtros.guardarPendiente('ron');
    assert.equal(filtros.promoverPendiente(), true);
    assert.equal(filtros.consumir(), 'ron');
    assert.equal(filtros.consumir(), null);
});
