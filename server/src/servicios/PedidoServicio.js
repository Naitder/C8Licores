import { ErrorApp } from '../errores.js';
import { ajustarStock } from './ProductoServicio.js';
import { calcularLinea, promocionActiva } from './PromocionServicio.js';
import { desglosarIva } from './impuestos.js';
import { validarDatosFactura } from './FacturaServicio.js';
import { verificarMayorEdad } from './verificacion.js';
import { hoyLocal } from '../tiempo.js';

export const METODOS_PAGO = Object.freeze(['contra_entrega', 'transferencia', 'manual']);
export const ESTADOS_PEDIDO = Object.freeze(['pendiente_pago', 'completado', 'cancelado']);

const CONSULTA_PEDIDOS = `SELECT p.*, u.nombre AS cliente_nombre, u.email AS cliente_email, u.telefono AS cliente_telefono,
        v.nombre AS vendedor_nombre, t.nombre AS turno_nombre,
        f.numero AS factura_numero, f.pedida_por_cliente AS factura_pedida
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios v ON v.id = p.vendedor_id
    LEFT JOIN turnos t ON t.id = p.turno_id
    LEFT JOIN facturas f ON f.pedido_id = p.id`;

/**
 * Precia un carrito con la regla única de promociones (calcularLinea).
 * No escribe nada: lo usan la cotización y, dentro de una transacción, el pedido.
 * Devuelve las líneas y el total; `disponible` indica si hay existencias suficientes.
 */
export function preciarCarrito(db, cantidades) {
    const lineas = [];
    let total = 0;
    for (const [productoId, cantidad] of cantidades) {
        const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId);
        if (!p || p.estado === 'inactivo') {
            throw new ErrorApp(409, 'Uno de los productos ya no está disponible.');
        }
        const linea = calcularLinea(p.precio, cantidad, promocionActiva(db, productoId));
        lineas.push({
            productoId,
            nombre: p.nombre,
            precio: p.precio,
            cantidad,
            subtotal: linea.subtotal,
            descuento: linea.descuento,
            promocion: linea.promocion,
            stock: p.stock,
            disponible: p.stock >= cantidad
        });
        total += linea.subtotal;
    }
    return { lineas, total };
}

/**
 * Valida las líneas de un carrito y consolida las repetidas del mismo producto.
 * Lo usan la compra web y la venta en tienda.
 */
export function consolidarLineas(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new ErrorApp(400, 'Datos no válidos.', { items: 'El carrito está vacío.' });
    }
    const cantidades = new Map();
    for (const linea of items) {
        const productoId = Number(linea?.productoId);
        const cantidad = Number(linea?.cantidad);
        if (!Number.isInteger(productoId) || productoId <= 0
            || !Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) {
            throw new ErrorApp(400, 'Hay un artículo con datos no válidos.');
        }
        cantidades.set(productoId, (cantidades.get(productoId) ?? 0) + cantidad);
    }
    return cantidades;
}

/**
 * Pedidos. Toda operación que cambia inventario se hace dentro de una
 * transacción `BEGIN IMMEDIATE`, así dos compras simultáneas no pueden vender
 * más unidades de las que existen.
 */
export class PedidoServicio {
    #db;
    #auditoria;
    #facturas;
    #empresa;
    #notificaciones;
    #jornadas;

    constructor({ db, auditoria, facturas, empresa, notificaciones, jornadas }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#facturas = facturas;
        this.#empresa = empresa;
        this.#notificaciones = notificaciones;
        this.#jornadas = jornadas;
    }

    /**
     * Avisa del pedido web solo a quien tiene sesión abierta en este momento: superadministradores,
     * y vendedores con jornada abierta hoy. Quien no está conectado ve el pedido en su cola al entrar.
     */
    #avisarPersonal(pedidoId, usuario, { total, direccion, metodoPago }) {
        const destinos = this.#personalConectado();
        const celular = this.#db.prepare('SELECT telefono FROM usuarios WHERE id = ?').get(usuario.id)?.telefono;
        const mensaje = `Nuevo pedido web #${pedidoId} de ${usuario.nombre}: $${Number(total).toLocaleString('es-CO')} `
            + `(${metodoPago}). Celular de contacto: ${celular ?? 'no registrado'}. Entrega: ${direccion.trim()}.`;
        for (const d of destinos) this.#notificaciones.crear(d.id, mensaje);
    }

    /** Personal que puede atender pedidos web y tiene sesión abierta ahora mismo. */
    #personalConectado() {
        return this.#db.prepare(`SELECT u.id FROM usuarios u
                WHERE u.activo = 1
                  AND EXISTS (SELECT 1 FROM sesiones s WHERE s.usuario_id = u.id AND s.expira_en > ?)
                  AND (u.rol = 'superadmin' OR (u.rol = 'vendedor' AND EXISTS (
                        SELECT 1 FROM jornadas j WHERE j.usuario_id = u.id AND j.salida_en IS NULL AND j.fecha = ?)))`)
            .all(new Date().toISOString(), hoyLocal(this.#db));
    }

    /**
     * Al iniciar sesión, si el usuario puede atender pedidos web, recibe la lista de los que siguen
     * pendientes. Un vendedor solo la recibe con jornada abierta hoy.
     */
    avisarPendientesA(usuario) {
        if (usuario.rol === 'vendedor' && !this.#jornadas.activa(usuario.id)) return;
        if (!['vendedor', 'superadmin'].includes(usuario.rol)) return;
        const pendientes = this.#db.prepare(`SELECT id FROM pedidos
                WHERE origen = 'web' AND estado = 'pendiente_pago' AND vendedor_id IS NULL ORDER BY id`).all();
        if (pendientes.length === 0) return;
        const numeros = pendientes.slice(0, 10).map(p => `#${p.id}`).join(', ');
        const extra = pendientes.length > 10 ? ` y ${pendientes.length - 10} más` : '';
        this.#notificaciones.crear(usuario.id,
            `Pedidos web pendientes de atender: ${numeros}${extra}. Atiéndelos desde «Pedidos web».`);
    }

    /**
     * Cotiza un carrito sin registrar nada: precios con promociones y existencias.
     * La tienda la usa para mostrar el total antes de comprar.
     */
    cotizar(items) {
        const { lineas, total: base } = preciarCarrito(this.#db, consolidarLineas(items));
        const { subtotal, iva, total } = desglosarIva(base);
        return {
            subtotal,
            iva,
            total,
            descuento: lineas.reduce((s, l) => s + l.descuento, 0),
            lineas,
            disponible: lineas.every(l => l.disponible)
        };
    }

    /**
     * Simula el checkout: valida existencias, descuenta stock y registra el
     * pedido como "pendiente_pago". El pago real queda pendiente de confirmar.
     */
    /**
     * Compra web. `factura` es opcional: si el cliente la pide en el momento,
     * se emite en la misma transacción; si no, puede pedirla después.
     */
    crear(usuario, { items, direccion, metodoPago = 'contra_entrega', factura = null, verificacion = null } = {}) {
        const errores = {};
        if (!Array.isArray(items) || items.length === 0) errores.items = 'El carrito está vacío.';
        if (String(direccion ?? '').trim().length < 5) errores.direccion = 'Ingresa una dirección de entrega válida.';
        if (!METODOS_PAGO.includes(metodoPago)) errores.metodoPago = 'Método de pago no válido.';
        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
        const datosFactura = factura ? validarDatosFactura(factura) : null;
        const edad = verificarMayorEdad(verificacion);

        const cantidades = consolidarLineas(items);
        const db = this.#db;
        db.exec('BEGIN IMMEDIATE');
        try {
            const { lineas, total: base } = preciarCarrito(db, cantidades);
            const { iva, total } = desglosarIva(base);
            for (const l of lineas) {
                if (!l.disponible) {
                    throw new ErrorApp(409, `Solo hay ${l.stock} unidad(es) disponibles de "${l.nombre}".`);
                }
                ajustarStock(db, l.productoId, -l.cantidad);
            }

            const pedido = db.prepare(`INSERT INTO pedidos (usuario_id, total, iva, estado, metodo_pago, direccion_entrega,
                    fecha_nacimiento, cedula_verificada)
                VALUES (?, ?, ?, 'pendiente_pago', ?, ?, ?, ?)`)
                .run(usuario.id, total, iva, metodoPago, direccion.trim(), edad.fechaNacimiento, edad.identificacion);
            const pedidoId = Number(pedido.lastInsertRowid);

            const insertarLinea = db.prepare(`INSERT INTO pedido_items
                (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, descuento, promocion)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const l of lineas) {
                insertarLinea.run(pedidoId, l.productoId, l.nombre, l.precio, l.cantidad,
                    l.subtotal, l.descuento, l.promocion);
            }

            // Toda compra tiene factura interna. Si el cliente la pidió, sale con sus datos.
            this.#facturas.crearParaPedido(pedidoId,
                datosFactura ?? { nombre: usuario.nombre, identificacion: edad.identificacion },
                total, usuario, { pedida: Boolean(datosFactura) });

            this.#auditoria.registrar(usuario.id, 'crear_pedido', 'pedido', pedidoId, {
                total, iva, articulos: lineas.length, metodoPago, factura: Boolean(datosFactura)
            });
            this.#avisarPersonal(pedidoId, usuario, { total, direccion, metodoPago });
            // Cuentas creadas antes de pedir estos datos: la primera compra los deja guardados.
            if (usuario.rol === 'cliente') {
                db.prepare(`UPDATE usuarios SET fecha_nacimiento = COALESCE(fecha_nacimiento, ?),
                        identificacion = COALESCE(identificacion, ?) WHERE id = ?`)
                    .run(edad.fechaNacimiento, edad.identificacion, usuario.id);
            }
            db.exec('COMMIT');
            const dto = this.obtener(pedidoId, usuario);
            // Con transferencia, el cliente necesita la cuenta para pagar.
            return metodoPago === 'transferencia'
                ? { ...dto, cuentaTransferencia: this.#empresa.cuentaTransferencia }
                : dto;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    /** Pedidos de la propia cuenta (también para el administrador), para su perfil. */
    listarMios(usuario) {
        return this.#db.prepare(`${CONSULTA_PEDIDOS} WHERE p.usuario_id = ? ORDER BY p.id DESC`)
            .all(usuario.id)
            .map(f => this.#dto(f));
    }

    listar(usuario) {
        const filas = usuario.rol === 'superadmin'
            ? this.#db.prepare(`${CONSULTA_PEDIDOS} ORDER BY p.id DESC`).all()
            : this.#db.prepare(`${CONSULTA_PEDIDOS} WHERE p.usuario_id = ? ORDER BY p.id DESC`).all(usuario.id);
        return filas.map(f => this.#dto(f));
    }

    /**
     * Pedidos del turno de hoy: los de todos los vendedores que estuvieron en turno hoy
     * (ventas de tienda y pedidos web atendidos). El superadministrador ve todos.
     */
    listarDelTurno(usuario) {
        if (usuario.rol === 'superadmin') return this.listar(usuario);
        const turnos = this.#db.prepare(`SELECT DISTINCT turno_id AS id FROM jornadas
                WHERE usuario_id = ? AND fecha = ? AND turno_id IS NOT NULL`)
            .all(usuario.id, hoyLocal(this.#db)).map(t => t.id);
        if (turnos.length === 0) return [];
        const marcas = turnos.map(() => '?').join(', ');
        return this.#db.prepare(`${CONSULTA_PEDIDOS} WHERE p.turno_id IN (${marcas}) ORDER BY p.id DESC`)
            .all(...turnos).map(f => this.#dto(f));
    }

    /** Ventas hechas en tienda. El administrador ve todas; el vendedor, solo las suyas. */
    listarVentasTienda(usuario) {
        const base = `${CONSULTA_PEDIDOS} WHERE p.origen = 'tienda'`;
        const filas = usuario.rol === 'superadmin'
            ? this.#db.prepare(`${base} ORDER BY p.id DESC LIMIT 200`).all()
            : this.#db.prepare(`${base} AND p.vendedor_id = ? ORDER BY p.id DESC LIMIT 200`).all(usuario.id);
        return filas.map(f => this.#dto(f));
    }

    /** Uso interno de servicios que ya validaron el acceso (p. ej. tras registrar una venta). */
    obtenerDto(id) {
        const fila = this.#db.prepare(`${CONSULTA_PEDIDOS} WHERE p.id = ?`).get(id);
        if (!fila) throw new ErrorApp(404, 'Pedido no encontrado.');
        return this.#dto(fila);
    }

    obtener(id, usuario) {
        const fila = this.#db.prepare(`${CONSULTA_PEDIDOS} WHERE p.id = ?`).get(id);
        // Un cliente no puede ver pedidos ajenos; se responde 404 para no revelar su existencia.
        if (!fila || (usuario.rol !== 'superadmin' && fila.usuario_id !== usuario.id)) {
            throw new ErrorApp(404, 'Pedido no encontrado.');
        }
        return this.#dto(fila);
    }

    cambiarEstado(id, nuevoEstado, actor) {
        if (!ESTADOS_PEDIDO.includes(nuevoEstado)) throw new ErrorApp(400, 'Estado no válido.');

        const db = this.#db;
        db.exec('BEGIN IMMEDIATE');
        try {
            const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
            if (!pedido) throw new ErrorApp(404, 'Pedido no encontrado.');
            if (pedido.estado === nuevoEstado) throw new ErrorApp(409, 'El pedido ya está en ese estado.');
            if (pedido.estado === 'cancelado') {
                throw new ErrorApp(409, 'Un pedido cancelado no puede reactivarse; crea un pedido nuevo.');
            }

            // Cancelar devuelve las unidades al inventario.
            if (nuevoEstado === 'cancelado') {
                const items = db.prepare('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?').all(id);
                for (const item of items) ajustarStock(db, item.producto_id, item.cantidad);
            }

            db.prepare(`UPDATE pedidos SET estado = ?, actualizado_en = datetime('now') WHERE id = ?`)
                .run(nuevoEstado, id);
            this.#auditoria.registrar(actor.id, 'cambiar_estado_pedido', 'pedido', id,
                { antes: pedido.estado, despues: nuevoEstado });
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return this.obtenerDto(id);
    }

    /** Pedidos web para el vendedor en turno: los pendientes de atender y los que ya atendió el turno. */
    listarWebVendedor(usuario) {
        const esSuperadmin = usuario.rol === 'superadmin';
        const jornada = esSuperadmin ? null : this.#jornadas.activa(usuario.id);
        if (!esSuperadmin && !jornada) return { turnoActivo: false, pendientes: [], atendidos: [] };
        const pendientes = this.#db.prepare(`${CONSULTA_PEDIDOS}
                WHERE p.origen = 'web' AND p.estado = 'pendiente_pago' AND p.vendedor_id IS NULL
                ORDER BY p.id`).all().map(f => this.#dto(f));
        // El vendedor ve lo atendido en su turno (de cualquier compañero); el superadministrador, lo suyo.
        const atendidos = esSuperadmin
            ? this.#db.prepare(`${CONSULTA_PEDIDOS}
                WHERE p.origen = 'web' AND p.vendedor_id = ? ORDER BY p.id DESC LIMIT 200`).all(usuario.id)
            : this.#db.prepare(`${CONSULTA_PEDIDOS}
                WHERE p.origen = 'web' AND p.turno_id = ? ORDER BY p.id DESC LIMIT 200`).all(jornada.turnoId);
        return { turnoActivo: true, pendientes, atendidos: atendidos.map(f => this.#dto(f)) };
    }

    /**
     * Toma un pedido web pendiente: queda a nombre de quien lo toma (vendedor en turno o superadministrador).
     * La factura y las ventas del turno siguen a quien lo atiende.
     */
    atender(id, usuario) {
        const esSuperadmin = usuario.rol === 'superadmin';
        const jornada = esSuperadmin ? null : this.#jornadas.activa(usuario.id);
        if (!esSuperadmin && !jornada) throw new ErrorApp(409, 'Marca tu entrada para atender pedidos web.');
        const turnoId = jornada?.turnoId ?? null;
        const db = this.#db;
        db.exec('BEGIN IMMEDIATE');
        try {
            const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ? AND origen = 'web'").get(id);
            if (!pedido) throw new ErrorApp(404, 'Pedido no encontrado.');
            if (pedido.vendedor_id) throw new ErrorApp(409, 'Este pedido ya lo atiende otro vendedor.');
            if (pedido.estado !== 'pendiente_pago') throw new ErrorApp(409, 'Este pedido ya no está pendiente.');
            db.prepare(`UPDATE pedidos SET vendedor_id = ?, turno_id = ?, actualizado_en = datetime('now')
                WHERE id = ?`).run(usuario.id, turnoId, id);
            this.#auditoria.registrar(usuario.id, 'atender_pedido', 'pedido', id, { turno: turnoId });
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return this.obtenerDto(id);
    }

    /** Completar o cancelar: el administrador cualquier pedido; el vendedor, solo los que atiende. */
    cambiarEstadoVendedor(id, nuevoEstado, usuario) {
        if (usuario.rol === 'superadmin') return this.cambiarEstado(id, nuevoEstado, usuario);
        if (!['completado', 'cancelado'].includes(nuevoEstado)) throw new ErrorApp(400, 'Estado no válido.');
        const pedido = this.#db.prepare('SELECT vendedor_id FROM pedidos WHERE id = ?').get(id);
        if (!pedido) throw new ErrorApp(404, 'Pedido no encontrado.');
        if (pedido.vendedor_id !== usuario.id) {
            throw new ErrorApp(403, 'Solo el vendedor que atiende el pedido puede cambiar su estado.');
        }
        return this.cambiarEstado(id, nuevoEstado, usuario);
    }

    #dto(p) {
        const items = this.#db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id')
            .all(p.id)
            .map(i => ({
                productoId: i.producto_id,
                nombre: i.nombre_producto,
                precioUnitario: i.precio_unitario,
                cantidad: i.cantidad,
                descuento: i.descuento,
                promocion: i.promocion,
                subtotal: i.subtotal
            }));
        const enTienda = p.origen === 'tienda';
        return {
            id: p.id,
            total: p.total,
            iva: p.iva,
            estado: p.estado,
            origen: p.origen,
            metodoPago: p.metodo_pago,
            direccion: p.direccion_entrega,
            creadoEn: p.creado_en,
            cliente: enTienda ? 'Venta en tienda' : p.cliente_email,
            clienteNombre: enTienda ? null : (p.cliente_nombre ?? null),
            clienteTelefono: enTienda ? null : (p.cliente_telefono ?? null),
            vendedor: p.vendedor_nombre ?? null,
            turno: p.turno_nombre ?? null,
            formaPago: p.forma_pago ?? null,
            pagoRecibido: p.pago_recibido ?? null,
            cambio: p.cambio ?? null,
            descuento: items.reduce((s, i) => s + i.descuento, 0),
            facturaNumero: p.factura_numero ?? null,
            facturaPedidaPorCliente: p.factura_pedida === 1,
            items
        };
    }
}
