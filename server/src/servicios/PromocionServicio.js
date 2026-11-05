import { ErrorApp } from '../errores.js';

export const TIPOS_PROMOCION = Object.freeze(['porcentaje', 'monto', 'nxm']);

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Texto corto que se muestra al cliente: "20% de descuento", "$5.000 de descuento", "2x1". */
export function textoPromocion(p) {
    if (p.tipo === 'porcentaje') return `${p.valor}% de descuento`;
    if (p.tipo === 'monto') return `$${COP.format(p.valor)} de descuento`;
    return `${p.lleva}x${p.paga}`;
}

export function aPromocionDTO(f) {
    const p = {
        id: f.id,
        productoId: f.producto_id,
        productoNombre: f.producto_nombre ?? null,
        nombre: f.nombre,
        tipo: f.tipo,
        valor: f.valor ?? null,
        lleva: f.lleva ?? null,
        paga: f.paga ?? null,
        activa: f.activa === 1
    };
    return { ...p, texto: textoPromocion(p) };
}

/** Promoción activa de un producto (o null). Se usa para precios de catálogo, compra y venta. */
export function promocionActiva(db, productoId) {
    const fila = db.prepare(`SELECT * FROM promociones WHERE producto_id = ? AND activa = 1`).get(productoId);
    return fila ? aPromocionDTO(fila) : null;
}

/**
 * Calcula una línea de pedido. Es la única regla de precios del sistema:
 * - porcentaje: descuento sobre el precio unitario.
 * - monto: se resta un valor fijo a cada unidad.
 * - nxm (p. ej. 2x1): por cada grupo de `lleva` unidades se cobran `paga`.
 */
export function calcularLinea(precio, cantidad, promo) {
    if (!promo) return { subtotal: precio * cantidad, descuento: 0, promocion: null };

    if (promo.tipo === 'nxm') {
        const gratis = Math.floor(cantidad / promo.lleva) * (promo.lleva - promo.paga);
        const descuento = gratis * precio;
        return {
            subtotal: precio * cantidad - descuento,
            descuento,
            promocion: `${promo.nombre} (${textoPromocion(promo)})`
        };
    }

    const unitario = promo.tipo === 'porcentaje'
        ? Math.round(precio * (100 - promo.valor) / 100)
        : Math.max(precio - promo.valor, 0);
    const subtotal = unitario * cantidad;
    return {
        subtotal,
        descuento: precio * cantidad - subtotal,
        promocion: `${promo.nombre} (${textoPromocion(promo)})`
    };
}

function esEnteroPositivo(valor) {
    return Number.isInteger(valor) && valor > 0;
}

/** CRUD de promociones. El superadministrador y los vendedores con el permiso pueden usarlo. */
export class PromocionServicio {
    #db;
    #auditoria;

    constructor({ db, auditoria }) {
        this.#db = db;
        this.#auditoria = auditoria;
    }

    listar() {
        return this.#db.prepare(`SELECT pr.*, p.nombre AS producto_nombre
                FROM promociones pr JOIN productos p ON p.id = pr.producto_id
                ORDER BY pr.activa DESC, p.nombre, pr.id`)
            .all().map(aPromocionDTO);
    }

    crear(datos, actor) {
        const v = this.#validar(datos);
        this.#verificarProducto(v.productoId, v);
        if (v.activa) this.#verificarUnicaActiva(v.productoId, null);

        const r = this.#db.prepare(`INSERT INTO promociones (producto_id, nombre, tipo, valor, lleva, paga, activa)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(v.productoId, v.nombre, v.tipo, v.valor, v.lleva, v.paga, v.activa ? 1 : 0);
        const id = Number(r.lastInsertRowid);
        this.#auditoria.registrar(actor.id, 'crear_promocion', 'promocion', id, { nombre: v.nombre, tipo: v.tipo });
        return this.#dto(id);
    }

    actualizar(id, datos, actor) {
        const actual = this.#fila(id);
        const v = this.#validar({
            productoId: actual.producto_id,
            nombre: actual.nombre,
            tipo: actual.tipo,
            valor: actual.valor,
            lleva: actual.lleva,
            paga: actual.paga,
            activa: actual.activa === 1,
            ...datos
        });
        this.#verificarProducto(v.productoId, v);
        if (v.activa) this.#verificarUnicaActiva(v.productoId, id);

        this.#db.prepare(`UPDATE promociones SET producto_id = ?, nombre = ?, tipo = ?, valor = ?, lleva = ?, paga = ?,
                activa = ?, actualizado_en = datetime('now') WHERE id = ?`)
            .run(v.productoId, v.nombre, v.tipo, v.valor, v.lleva, v.paga, v.activa ? 1 : 0, id);

        this.#auditoria.registrar(actor.id, 'actualizar_promocion', 'promocion', id, {
            antes: { nombre: actual.nombre, tipo: actual.tipo, valor: actual.valor, lleva: actual.lleva, paga: actual.paga, activa: actual.activa === 1 },
            despues: { nombre: v.nombre, tipo: v.tipo, valor: v.valor, lleva: v.lleva, paga: v.paga, activa: v.activa }
        });
        return this.#dto(id);
    }

    eliminar(id, actor) {
        const fila = this.#fila(id);
        this.#db.prepare('DELETE FROM promociones WHERE id = ?').run(id);
        this.#auditoria.registrar(actor.id, 'eliminar_promocion', 'promocion', id, { nombre: fila.nombre });
    }

    #validar(datos = {}) {
        const errores = {};
        const productoId = Number(datos.productoId);
        const nombre = String(datos.nombre ?? '').trim();
        const tipo = datos.tipo;
        const activa = datos.activa !== false;
        const salida = { productoId, nombre, tipo, valor: null, lleva: null, paga: null, activa };

        if (!esEnteroPositivo(productoId)) errores.productoId = 'Elige un producto.';
        if (!nombre || nombre.length > 60) errores.nombre = 'El nombre es obligatorio (máximo 60 caracteres).';
        if (!TIPOS_PROMOCION.includes(tipo)) errores.tipo = 'Elige un tipo de promoción.';

        if (tipo === 'porcentaje') {
            const valor = Number(datos.valor);
            if (!Number.isInteger(valor) || valor < 1 || valor > 99) errores.valor = 'El descuento debe ser un porcentaje entre 1 y 99.';
            else salida.valor = valor;
        } else if (tipo === 'monto') {
            const valor = Number(datos.valor);
            if (!esEnteroPositivo(valor)) errores.valor = 'El descuento debe ser un valor en pesos mayor que 0.';
            else salida.valor = valor;
        } else if (tipo === 'nxm') {
            const lleva = Number(datos.lleva);
            const paga = Number(datos.paga);
            if (!esEnteroPositivo(paga)) errores.paga = 'Cuántas unidades se pagan debe ser un entero mayor que 0.';
            if (!esEnteroPositivo(lleva)) errores.lleva = 'Cuántas unidades se llevan debe ser un entero mayor que 0.';
            if (!errores.lleva && !errores.paga && lleva <= paga) {
                errores.paga = 'En una promoción NxM, las unidades que se llevan deben ser más que las que se pagan.';
            }
            if (!errores.lleva) salida.lleva = lleva;
            if (!errores.paga) salida.paga = paga;
        }

        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
        return salida;
    }

    #verificarProducto(productoId, v) {
        const producto = this.#db.prepare('SELECT precio FROM productos WHERE id = ?').get(productoId);
        if (!producto) throw new ErrorApp(400, 'Datos no válidos.', { productoId: 'El producto no existe.' });
        if (v.tipo === 'monto' && v.valor >= producto.precio) {
            throw new ErrorApp(400, 'Datos no válidos.', {
                valor: `El descuento debe ser menor que el precio del producto ($${COP.format(producto.precio)}).`
            });
        }
    }

    #verificarUnicaActiva(productoId, excluirId) {
        const otra = this.#db.prepare(`SELECT id FROM promociones
            WHERE producto_id = ? AND activa = 1 AND id IS NOT ?`).get(productoId, excluirId);
        if (otra) {
            throw new ErrorApp(409, 'Ese producto ya tiene una promoción activa. Desactívala antes de activar otra.');
        }
    }

    #fila(id) {
        const fila = this.#db.prepare(`SELECT pr.*, p.nombre AS producto_nombre FROM promociones pr
            JOIN productos p ON p.id = pr.producto_id WHERE pr.id = ?`).get(id);
        if (!fila) throw new ErrorApp(404, 'Promoción no encontrada.');
        return fila;
    }

    #dto(id) {
        return aPromocionDTO(this.#fila(id));
    }
}
