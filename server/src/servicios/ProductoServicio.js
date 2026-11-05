import fs from 'node:fs';
import path from 'node:path';
import { ErrorApp } from '../errores.js';
import { promocionActiva } from './PromocionServicio.js';

/** Formatos de foto que se aceptan desde el panel y cómo se reconocen por sus primeros bytes. */
const FORMATOS_IMAGEN = {
    'image/png': { extension: 'png', valida: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
    'image/jpeg': { extension: 'jpg', valida: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    'image/webp': { extension: 'webp', valida: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' }
};
const CARPETA_FOTOS = 'img/productos';

/**
 * Cambia las existencias de un producto. El estado se recalcula en la misma
 * sentencia, así stock y estado nunca quedan inconsistentes.
 * Un producto inactivo conserva ese estado aunque cambie el stock.
 */
export function ajustarStock(db, productoId, delta) {
    db.prepare(`UPDATE productos SET
            stock = stock + ?,
            estado = CASE
                WHEN estado = 'inactivo' THEN 'inactivo'
                WHEN stock + ? > 0 THEN 'disponible'
                ELSE 'agotado'
            END,
            actualizado_en = datetime('now')
        WHERE id = ?`).run(delta, delta, productoId);
}

/**
 * Precio que paga el cliente por una unidad. Las promociones NxM no cambian el
 * precio unitario (se aplican por cantidad), así que aquí devuelven el precio normal.
 */
function precioUnitarioConPromocion(precio, promo) {
    if (!promo || promo.tipo === 'nxm') return precio;
    if (promo.tipo === 'porcentaje') return Math.round(precio * (100 - promo.valor) / 100);
    return Math.max(precio - promo.valor, 0);
}

export function aProductoDTO(f, promo = null) {
    return {
        id: f.id,
        nombre: f.nombre,
        descripcion: f.descripcion,
        imagen: f.imagen,
        precio: f.precio,
        precioFinal: precioUnitarioConPromocion(f.precio, promo),
        promocion: promo,
        medida: f.medida,
        categoria: f.categoria,
        popular: f.popular === 1,
        stock: f.stock,
        estado: f.estado
    };
}

const ESTADOS_VALIDOS = ['disponible', 'agotado', 'inactivo'];

function aEntero(valor) {
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return valor;
}

function esEntero(valor) {
    return Number.isInteger(aEntero(valor));
}

function estadoPara(stock, inactivo) {
    if (inactivo) return 'inactivo';
    return stock > 0 ? 'disponible' : 'agotado';
}

/**
 * Valida solo los campos que llegan. `estado` se acepta como 'inactivo' o
 * 'disponible'/'agotado': estos dos últimos se derivan del stock.
 * Los descuentos no se editan aquí: tienen su propia sección (promociones).
 */
function normalizarEntrada(datos = {}) {
    const salida = {};
    const errores = {};
    const texto = (campo) => String(datos[campo] ?? '').trim();

    if ('nombre' in datos) {
        if (!texto('nombre')) errores.nombre = 'El nombre es obligatorio.';
        else salida.nombre = texto('nombre');
    }
    if ('descripcion' in datos) salida.descripcion = texto('descripcion');
    if ('imagen' in datos) salida.imagen = texto('imagen');
    if ('medida' in datos) salida.medida = texto('medida');
    if ('categoria' in datos) salida.categoria = texto('categoria') || 'Sin clasificar';
    if ('popular' in datos) salida.popular = datos.popular ? 1 : 0;

    if ('precio' in datos) {
        if (!esEntero(datos.precio) || aEntero(datos.precio) < 0) errores.precio = 'El precio debe ser un entero mayor o igual a 0.';
        else salida.precio = aEntero(datos.precio);
    }
    if ('stock' in datos) {
        if (!esEntero(datos.stock) || aEntero(datos.stock) < 0) errores.stock = 'El stock debe ser un entero mayor o igual a 0.';
        else salida.stock = aEntero(datos.stock);
    }
    if ('estado' in datos) {
        if (!ESTADOS_VALIDOS.includes(datos.estado)) errores.estado = 'Estado no válido.';
        else salida.inactivo = datos.estado === 'inactivo';
    }

    if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
    return salida;
}

export class ProductoServicio {
    #db;
    #auditoria;

    #raiz;

    constructor({ db, auditoria, raiz }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#raiz = raiz;
    }

    /**
     * Guarda una foto subida desde el panel en img/productos y la deja como imagen del producto.
     * La foto anterior, si también se subió desde aquí, se borra del disco.
     */
    guardarImagen(id, bytes, tipo, actor) {
        const actual = this.#fila(id);
        const formato = FORMATOS_IMAGEN[String(tipo ?? '').split(';')[0].trim().toLowerCase()];
        if (!Buffer.isBuffer(bytes) || bytes.length === 0 || !formato) {
            throw new ErrorApp(400, 'Selecciona una imagen PNG, JPG o WEBP.');
        }
        if (!formato.valida(bytes)) throw new ErrorApp(400, 'El archivo no es una imagen válida.');

        const carpeta = path.join(this.#raiz, ...CARPETA_FOTOS.split('/'));
        fs.mkdirSync(carpeta, { recursive: true });
        const relativa = `${CARPETA_FOTOS}/p${id}-${Date.now()}.${formato.extension}`;
        fs.writeFileSync(path.join(this.#raiz, relativa), bytes);
        this.#db.prepare("UPDATE productos SET imagen = ?, actualizado_en = datetime('now') WHERE id = ?").run(relativa, id);
        this.#borrarFotoSubida(actual.imagen);
        this.#auditoria.registrar(actor.id, 'imagen', 'producto', id, { imagen: relativa });
        return this.obtener(id, { incluirInactivos: true });
    }

    #borrarFotoSubida(ruta) {
        if (typeof ruta === 'string' && ruta.startsWith(`${CARPETA_FOTOS}/`)) {
            try {
                fs.rmSync(path.join(this.#raiz, ruta), { force: true });
            } catch {
                // Si el archivo ya no está o no se puede borrar, el producto igual queda correcto.
            }
        }
    }

    /** Catálogo público: excluye productos inactivos. */
    listarPublicos() {
        return this.#db.prepare(`SELECT * FROM productos WHERE estado != 'inactivo' ORDER BY id`)
            .all().map(f => this.#dto(f));
    }

    listarTodos() {
        return this.#db.prepare('SELECT * FROM productos ORDER BY id').all().map(f => this.#dto(f));
    }

    obtener(id, { incluirInactivos = false } = {}) {
        const fila = this.#fila(id);
        if (fila.estado === 'inactivo' && !incluirInactivos) {
            throw new ErrorApp(404, 'Producto no encontrado.');
        }
        return this.#dto(fila);
    }

    crear(datos, actor) {
        const cambios = normalizarEntrada(datos);
        const faltantes = {};
        if (!cambios.nombre) faltantes.nombre = 'El nombre es obligatorio.';
        if (cambios.precio === undefined) faltantes.precio = 'El precio es obligatorio.';
        if (Object.keys(faltantes).length) throw new ErrorApp(400, 'Datos no válidos.', faltantes);

        const final = {
            nombre: cambios.nombre,
            descripcion: cambios.descripcion ?? '',
            imagen: cambios.imagen ?? '',
            precio: cambios.precio,
            medida: cambios.medida ?? '',
            categoria: cambios.categoria ?? 'Sin clasificar',
            popular: cambios.popular ?? 0,
            stock: cambios.stock ?? 0,
            inactivo: cambios.inactivo ?? false
        };

        const { lastInsertRowid } = this.#db.prepare(`INSERT INTO productos
                (nombre, descripcion, imagen, precio, medida, categoria, popular, stock, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(final.nombre, final.descripcion, final.imagen, final.precio,
                final.medida, final.categoria, final.popular, final.stock, estadoPara(final.stock, final.inactivo));

        const id = Number(lastInsertRowid);
        this.#auditoria.registrar(actor.id, 'crear', 'producto', id, { nombre: final.nombre, precio: final.precio });
        return this.obtener(id, { incluirInactivos: true });
    }

    actualizar(id, datos, actor) {
        const actual = this.#fila(id);
        const cambios = normalizarEntrada(datos);

        const sig = {
            nombre: cambios.nombre ?? actual.nombre,
            descripcion: cambios.descripcion ?? actual.descripcion,
            imagen: cambios.imagen ?? actual.imagen,
            precio: cambios.precio ?? actual.precio,
            medida: cambios.medida ?? actual.medida,
            categoria: cambios.categoria ?? actual.categoria,
            popular: cambios.popular ?? actual.popular,
            stock: cambios.stock ?? actual.stock
        };
        const inactivo = cambios.inactivo ?? actual.estado === 'inactivo';
        const estado = estadoPara(sig.stock, inactivo);

        this.#db.prepare(`UPDATE productos SET nombre = ?, descripcion = ?, imagen = ?, precio = ?,
                medida = ?, categoria = ?, popular = ?, stock = ?, estado = ?,
                actualizado_en = datetime('now')
            WHERE id = ?`)
            .run(sig.nombre, sig.descripcion, sig.imagen, sig.precio,
                sig.medida, sig.categoria, sig.popular, sig.stock, estado, id);

        // Auditoría: solo se registran los campos que realmente cambiaron (antes/después).
        const diferencias = {};
        for (const campo of Object.keys(sig)) {
            if (sig[campo] !== actual[campo]) diferencias[campo] = { antes: actual[campo], despues: sig[campo] };
        }
        if (estado !== actual.estado) diferencias.estado = { antes: actual.estado, despues: estado };
        if (Object.keys(diferencias).length) {
            this.#auditoria.registrar(actor.id, 'actualizar', 'producto', id, diferencias);
        }
        return this.obtener(id, { incluirInactivos: true });
    }

    eliminar(id, actor) {
        const fila = this.#fila(id);
        // Los pedidos ya hechos se conservan: sus ítems guardan nombre y precio.
        this.#db.prepare('DELETE FROM productos WHERE id = ?').run(id);
        this.#borrarFotoSubida(fila.imagen);
        this.#auditoria.registrar(actor.id, 'eliminar', 'producto', id, { nombre: fila.nombre });
    }

    #dto(fila) {
        return aProductoDTO(fila, promocionActiva(this.#db, fila.id));
    }

    #fila(id) {
        const fila = this.#db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
        if (!fila) throw new ErrorApp(404, 'Producto no encontrado.');
        return fila;
    }
}
