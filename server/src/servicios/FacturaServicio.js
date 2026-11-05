import PDFDocument from 'pdfkit';
import { ErrorApp } from '../errores.js';
import { hoyLocal } from '../tiempo.js';
import { TASA_IVA } from './impuestos.js';

const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Datos del cliente para la factura: nombre e identificación (CC, NIT, etc.). */
export function validarDatosFactura(factura) {
    const nombre = String(factura?.nombre ?? '').trim();
    const identificacion = String(factura?.identificacion ?? '').trim();
    const errores = {};
    if (nombre.length < 3 || nombre.length > 80) errores.facturaNombre = 'Escribe el nombre del cliente para la factura (3 a 80 caracteres).';
    if (!/^[0-9A-Za-z.-]{5,20}$/.test(identificacion)) errores.facturaIdentificacion = 'Escribe la identificación del cliente (5 a 20 caracteres, sin espacios).';
    if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
    return { nombre, identificacion };
}

/** Cliente por defecto cuando nadie pide la factura: consumidor final identificado por su cédula. */
export const CONSUMIDOR_FINAL = 'Consumidor final';

/** Lo que cada rol puede ver en el listado de facturas guardadas. */
const ALCANCES = ['todas', 'propias'];

/**
 * Facturas estándar (no electrónicas). Se genera una factura interna por cada
 * venta y cada compra web, las pida o no el cliente, para consultas y auditoría.
 * El cliente puede pedir después que la factura salga con sus datos.
 * El PDF se genera al descargarlo a partir de los datos guardados.
 *
 * Aviso: una factura electrónica con validez fiscal en Colombia requiere
 * habilitación ante la DIAN; este documento no la reemplaza.
 */
export class FacturaServicio {
    #db;
    #auditoria;
    #empresa;

    constructor({ db, auditoria, empresa }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#empresa = empresa;
    }

    /**
     * Se llama dentro de la transacción de la venta. Devuelve el número asignado.
     * `pedida` indica si el cliente pidió la factura con sus datos.
     */
    crearParaPedido(pedidoId, { nombre, identificacion }, total, actor, { pedida = false } = {}) {
        const siguiente = this.#db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM facturas').get().n;
        const numero = `FV-${String(siguiente).padStart(6, '0')}`;
        this.#db.prepare(`INSERT INTO facturas (numero, pedido_id, cliente_nombre, cliente_identificacion, total, pedida_por_cliente)
            VALUES (?, ?, ?, ?, ?, ?)`).run(numero, pedidoId, nombre, identificacion, total, pedida ? 1 : 0);
        this.#auditoria.registrar(actor.id, 'crear_factura', 'pedido', pedidoId, { numero, pedida });
        return numero;
    }

    /** Quien puede ver o pedir la factura de un pedido: el comprador, el vendedor que vendió y el administrador. */
    #pedidoAutorizado(pedidoId, usuario) {
        const pedido = this.#db.prepare(`SELECT p.*, f.numero, f.cliente_nombre, f.cliente_identificacion,
                f.pedida_por_cliente, v.nombre AS vendedor_nombre
            FROM pedidos p
            LEFT JOIN facturas f ON f.pedido_id = p.id
            LEFT JOIN usuarios v ON v.id = p.vendedor_id
            WHERE p.id = ?`).get(pedidoId);
        const autorizado = pedido && (usuario.rol === 'superadmin'
            || usuario.id === pedido.usuario_id || usuario.id === pedido.vendedor_id);
        return autorizado ? pedido : null;
    }

    /**
     * El cliente (o quien vende) pide que la factura salga con los datos indicados.
     * El número no cambia: si ya existe, se actualizan nombre e identificación.
     * Si ya fue pedida con esos datos, no se toca.
     */
    solicitar(pedidoId, datos, usuario) {
        const pedido = this.#pedidoAutorizado(pedidoId, usuario);
        if (!pedido) throw new ErrorApp(404, 'Pedido no encontrado.');
        if (pedido.estado === 'cancelado') throw new ErrorApp(409, 'El pedido está cancelado: no se puede facturar.');
        const cliente = validarDatosFactura(datos);

        if (pedido.numero) {
            if (pedido.pedida_por_cliente === 1) return { numero: pedido.numero, creada: false, actualizada: false };
            this.#db.prepare(`UPDATE facturas SET cliente_nombre = ?, cliente_identificacion = ?, pedida_por_cliente = 1
                WHERE pedido_id = ?`).run(cliente.nombre, cliente.identificacion, pedidoId);
            this.#auditoria.registrar(usuario.id, 'pedir_factura', 'pedido', pedidoId, { numero: pedido.numero });
            return { numero: pedido.numero, creada: false, actualizada: true };
        }
        const numero = this.crearParaPedido(pedidoId, cliente, pedido.total, usuario, { pedida: true });
        return { numero, creada: true, actualizada: false };
    }

    /**
     * Listado de facturas guardadas.
     * - Superadministrador: `alcance` 'todas' (por defecto) o 'propias' (solo las ventas que él registró).
     * - Vendedor: solo las ventas que él registró hoy (su turno).
     * - Cliente: no tiene acceso a este listado; sus compras están en /pedidos.
     */
    /**
     * Facturas guardadas. El vendedor ve las facturas de todos los pedidos de su turno de hoy
     * (propios y de sus compañeros del turno). El administrador ve todas, sus propias ventas,
     * o filtra por turno.
     */
    listar(usuario, alcance = 'todas', turno = null) {
        if (!['superadmin', 'vendedor'].includes(usuario.rol)) {
            throw new ErrorApp(403, 'No tienes acceso a las facturas guardadas.');
        }
        const condiciones = [];
        const valores = [];
        if (usuario.rol === 'vendedor') {
            const turnos = this.#db.prepare(`SELECT DISTINCT turno_id AS id FROM jornadas
                WHERE usuario_id = ? AND fecha = ? AND turno_id IS NOT NULL`)
                .all(usuario.id, hoyLocal(this.#db)).map(t => t.id);
            if (turnos.length === 0) {
                return { facturas: [], resumen: { cantidad: 0, total: 0, iva: 0 } };
            }
            condiciones.push(`p.turno_id IN (${turnos.map(() => '?').join(', ')})`);
            valores.push(...turnos);
        } else {
            if (alcance === 'propias') {
                condiciones.push('p.vendedor_id = ?');
                valores.push(usuario.id);
            } else if (!ALCANCES.includes(alcance)) {
                throw new ErrorApp(400, 'Alcance no válido.');
            }
            if (turno !== null && turno !== '') {
                const idTurno = Number(turno);
                if (!Number.isInteger(idTurno) || idTurno <= 0) throw new ErrorApp(400, 'Turno no válido.');
                condiciones.push('p.turno_id = ?');
                valores.push(idTurno);
            }
        }
        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

        const filas = this.#db.prepare(`SELECT f.numero, f.creado_en, f.cliente_nombre, f.cliente_identificacion,
                f.total, f.pedida_por_cliente, f.pedido_id, p.origen, p.iva, p.metodo_pago, p.forma_pago,
                p.cedula_verificada, u.nombre AS vendedor, t.nombre AS turno
            FROM facturas f
            JOIN pedidos p ON p.id = f.pedido_id
            LEFT JOIN usuarios u ON u.id = p.vendedor_id
            LEFT JOIN turnos t ON t.id = p.turno_id
            ${where}
            ORDER BY f.id DESC LIMIT 500`).all(...valores);

        const facturas = filas.map(f => ({
            numero: f.numero,
            creadoEn: f.creado_en,
            pedidoId: f.pedido_id,
            origen: f.origen,
            cliente: f.cliente_nombre,
            identificacion: f.cliente_identificacion,
            pedidaPorCliente: f.pedida_por_cliente === 1,
            vendedor: f.vendedor ?? null,
            turno: f.turno ?? null,
            metodoPago: f.origen === 'tienda' ? f.forma_pago : f.metodo_pago,
            total: f.total,
            iva: f.iva
        }));
        const resumen = {
            cantidad: facturas.length,
            total: facturas.reduce((s, f) => s + f.total, 0),
            iva: facturas.reduce((s, f) => s + f.iva, 0)
        };
        return { facturas, resumen };
    }

    /** PDF de la factura de un pedido. */
    async pdf(pedidoId, usuario) {
        const pedido = this.#pedidoAutorizado(pedidoId, usuario);
        if (!pedido || !pedido.numero) throw new ErrorApp(404, 'Factura no encontrada.');

        const items = this.#db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id').all(pedidoId);
        const buffer = await this.#generar(pedido, items);
        return { numero: pedido.numero, buffer };
    }

    #generar(pedido, items) {
        return new Promise((resolver, rechazar) => {
            const documento = new PDFDocument({ size: 'LETTER', margin: 50 });
            const trozos = [];
            documento.on('data', t => trozos.push(t));
            documento.on('end', () => resolver(Buffer.concat(trozos)));
            documento.on('error', rechazar);

            const e = this.#empresa;
            const subtotalBruto = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
            const descuentos = items.reduce((s, i) => s + i.descuento, 0);
            const base = pedido.total - pedido.iva;

            documento.font('Helvetica-Bold').fontSize(18).text(e.nombre);
            documento.font('Helvetica').fontSize(9);
            if (e.nit) documento.text(`NIT: ${e.nit}`);
            if (e.direccion) documento.text(e.direccion);

            documento.font('Helvetica-Bold').fontSize(14)
                .text('FACTURA ESTÁNDAR', 350, 50, { width: 212, align: 'right' });
            documento.font('Helvetica').fontSize(10)
                .text(`Nº ${pedido.numero}`, { width: 212, align: 'right' })
                .text(`Fecha: ${pedido.creado_en.slice(0, 16)}`, { width: 212, align: 'right' });

            documento.moveDown(2);
            documento.font('Helvetica-Bold').fontSize(10).text('Cliente');
            documento.font('Helvetica').text(`Nombre: ${pedido.cliente_nombre}`);
            documento.text(`Identificación: ${pedido.cliente_identificacion}`);
            documento.text(`Atendido por: ${pedido.vendedor_nombre ?? '—'}`);

            documento.moveDown(1.5);
            const y0 = documento.y;
            const col = { cant: 50, desc: 90, unit: 330, dto: 420, valor: 490 };
            documento.font('Helvetica-Bold').fontSize(9);
            documento.text('Cant.', col.cant, y0, { width: 35 });
            documento.text('Descripción', col.desc, y0, { width: 230 });
            documento.text('V. unitario', col.unit, y0, { width: 85, align: 'right' });
            documento.text('Descuento', col.dto, y0, { width: 65, align: 'right' });
            documento.text('Valor', col.valor, y0, { width: 62, align: 'right' });
            documento.moveTo(50, y0 + 14).lineTo(552, y0 + 14).stroke();

            documento.font('Helvetica').fontSize(9);
            documento.y = y0 + 22;
            for (const i of items) {
                const y = documento.y;
                documento.text(String(i.cantidad), col.cant, y, { width: 35 });
                documento.text(i.nombre_producto + (i.promocion ? `\n${i.promocion}` : ''), col.desc, y, { width: 230 });
                documento.text(PESOS.format(i.precio_unitario), col.unit, y, { width: 85, align: 'right' });
                documento.text(i.descuento ? `-${PESOS.format(i.descuento)}` : '—', col.dto, y, { width: 65, align: 'right' });
                documento.text(PESOS.format(i.subtotal), col.valor, y, { width: 62, align: 'right' });
                documento.moveDown(0.6);
            }

            let y = documento.y + 14;
            const totales = [
                ['Subtotal', subtotalBruto],
                ['Descuentos', -descuentos],
                ['Base gravable', base],
                [`IVA (${Math.round(TASA_IVA * 100)}%)`, pedido.iva],
                ['Total', pedido.total]
            ];
            for (const [etiqueta, valor] of totales) {
                const negrita = etiqueta === 'Total';
                if (etiqueta === 'Base gravable' && descuentos === 0) continue;
                documento.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 11 : 9);
                documento.text(etiqueta, 330, y, { width: 130, align: 'right', lineBreak: false });
                documento.text(PESOS.format(valor), 470, y, { width: 82, align: 'right', lineBreak: false });
                y += negrita ? 0 : 16;
            }
            documento.y = y + 30;
            documento.font('Helvetica').fontSize(9);
            const pago = pedido.forma_pago ?? pedido.metodo_pago;
            documento.text(`Forma de pago: ${etiquetaPago(pago)}`);
            if (pedido.forma_pago === 'efectivo') {
                documento.text(`Recibido: ${PESOS.format(pedido.pago_recibido)}   Cambio: ${PESOS.format(pedido.cambio)}`);
            }

            documento.fontSize(8).fillColor('#555').text(
                'Factura estándar de venta. No es una factura electrónica validada por la DIAN.',
                50, 700, { width: 500, align: 'center' });
            documento.end();
        });
    }
}

function etiquetaPago(forma) {
    return {
        efectivo: 'Efectivo',
        tarjeta: 'Tarjeta (datáfono)',
        transferencia: 'Transferencia',
        contra_entrega: 'Contra entrega',
        manual: 'Pago manual'
    }[forma] ?? '—';
}
