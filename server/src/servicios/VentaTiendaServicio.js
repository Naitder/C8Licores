import { ErrorApp } from '../errores.js';
import { ajustarStock } from './ProductoServicio.js';
import { consolidarLineas, preciarCarrito } from './PedidoServicio.js';
import { desglosarIva } from './impuestos.js';
import { validarDatosFactura, CONSUMIDOR_FINAL } from './FacturaServicio.js';
import { verificarMayorEdad } from './verificacion.js';

export const FORMAS_PAGO_TIENDA = Object.freeze(['efectivo', 'tarjeta', 'transferencia']);

/**
 * Venta presencial. Se registra como pedido con origen 'tienda', ya pagado y
 * entregado. Usa las mismas promociones que la compra web, descuenta stock y,
 * si el cliente lo pide, emite la factura en la misma transacción.
 *
 * El vendedor solo puede vender con su entrada abierta; el administrador puede
 * registrar ventas sin turno.
 */
export class VentaTiendaServicio {
    #db;
    #pedidos;
    #jornadas;
    #facturas;
    #auditoria;

    constructor({ db, pedidos, jornadas, facturas, auditoria }) {
        this.#db = db;
        this.#pedidos = pedidos;
        this.#jornadas = jornadas;
        this.#facturas = facturas;
        this.#auditoria = auditoria;
    }

    crear(usuario, { items, formaPago, pagoRecibido, factura = null, verificacion = null } = {}) {
        const cantidades = consolidarLineas(items);

        if (!FORMAS_PAGO_TIENDA.includes(formaPago)) {
            throw new ErrorApp(400, 'Datos no válidos.', { formaPago: 'Elige una forma de pago.' });
        }
        const datosFactura = factura ? validarDatosFactura(factura) : null;
        const edad = verificarMayorEdad(verificacion);

        const jornada = usuario.rol === 'vendedor' ? this.#jornadas.activa(usuario.id) : null;
        if (usuario.rol === 'vendedor' && !jornada) {
            throw new ErrorApp(409, 'Debes registrar tu entrada antes de vender.');
        }

        const db = this.#db;
        db.exec('BEGIN IMMEDIATE');
        try {
            const { lineas, total: base } = preciarCarrito(db, cantidades);
            const { iva, total } = desglosarIva(base);
            for (const l of lineas) {
                if (!l.disponible) {
                    throw new ErrorApp(409, `Solo hay ${l.stock} unidad(es) disponibles de "${l.nombre}".`);
                }
            }

            // Efectivo: hay que recibir al menos el total y se devuelve el cambio.
            // Tarjeta y transferencia se cobran por el total exacto.
            let recibido = total;
            let cambio = 0;
            if (formaPago === 'efectivo') {
                recibido = Number(pagoRecibido);
                if (!Number.isInteger(recibido) || recibido < 0) {
                    throw new ErrorApp(400, 'Datos no válidos.', { pagoRecibido: 'Escribe el dinero recibido en pesos.' });
                }
                if (recibido < total) {
                    throw new ErrorApp(400, 'Datos no válidos.', {
                        pagoRecibido: `El dinero recibido no alcanza. Faltan ${total - recibido} pesos.`
                    });
                }
                cambio = recibido - total;
            }

            for (const l of lineas) ajustarStock(db, l.productoId, -l.cantidad);

            const pedido = db.prepare(`INSERT INTO pedidos
                    (usuario_id, total, iva, estado, metodo_pago, direccion_entrega,
                     origen, vendedor_id, turno_id, forma_pago, pago_recibido, cambio,
                     fecha_nacimiento, cedula_verificada)
                VALUES (?, ?, ?, 'completado', 'manual', 'Venta en tienda', 'tienda', ?, ?, ?, ?, ?, ?, ?)`)
                .run(usuario.id, total, iva, usuario.id, jornada?.turnoId ?? null, formaPago, recibido, cambio,
                    edad.fechaNacimiento, edad.identificacion);
            const pedidoId = Number(pedido.lastInsertRowid);

            const insertarLinea = db.prepare(`INSERT INTO pedido_items
                (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, descuento, promocion)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const l of lineas) {
                insertarLinea.run(pedidoId, l.productoId, l.nombre, l.precio, l.cantidad,
                    l.subtotal, l.descuento, l.promocion);
            }

            // Toda venta tiene factura interna: sin datos del cliente sale como consumidor final.
            this.#facturas.crearParaPedido(pedidoId,
                datosFactura ?? { nombre: CONSUMIDOR_FINAL, identificacion: edad.identificacion },
                total, usuario, { pedida: Boolean(datosFactura) });

            this.#auditoria.registrar(usuario.id, 'venta_tienda', 'pedido', pedidoId, {
                total, iva, formaPago, cambio, articulos: lineas.length, factura: Boolean(datosFactura)
            });
            db.exec('COMMIT');
            return this.#pedidos.obtenerDto(pedidoId);
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}
