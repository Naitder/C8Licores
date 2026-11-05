import fs from 'node:fs';
import { hashPassword } from '../seguridad/password.js';
import { PASSWORD_ADMIN_POR_DEFECTO } from '../config.js';

/** Quita etiquetas HTML y espacios sobrantes. */
function limpiarTexto(valor) {
    return String(valor ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convierte un registro de json/tarjetas.json al formato de la tabla `productos`.
 * El JSON usa `titulo` o `nombre` según el registro; se aceptan ambos.
 * Si un registro es inválido se detiene el arranque con un mensaje claro.
 */
export function normalizarProducto(dato, indice) {
    const id = Number(dato?.id);
    const nombre = limpiarTexto(dato?.titulo || dato?.nombre);
    const precio = Number(dato?.precio);

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Catálogo, registro ${indice}: "id" debe ser un entero positivo.`);
    }
    if (!nombre) {
        throw new Error(`Catálogo, registro ${indice} (id ${id}): falta "titulo" o "nombre".`);
    }
    if (!Number.isInteger(precio) || precio < 0) {
        throw new Error(`Catálogo, registro ${indice} (id ${id}): "precio" debe ser un entero en pesos.`);
    }

    return {
        id,
        nombre,
        descripcion: limpiarTexto(dato.descripcion),
        imagen: String(dato.imagen ?? '').trim(),
        precio,
        medida: limpiarTexto(dato.medida),
        popular: dato.popular === true ? 1 : 0
    };
}

/**
 * Carga inicial. Es idempotente: se puede ejecutar en cada arranque sin
 * duplicar datos ni sobrescribir cambios hechos después (precios, stock, etc.).
 */
export function sembrarDatos(db, config) {
    const administradorCreado = sembrarAdministrador(db, config);
    const productosNuevos = sembrarProductos(db, config);
    const turnosNuevos = sembrarTurnos(db);
    return { administradorCreado, productosNuevos, turnosNuevos };
}

/**
 * Turnos fijos de partida. Son solo un punto de inicio: el administrador
 * puede cambiar sus horas o desactivarlos desde el panel. No se sobrescriben
 * si ya existen.
 */
export const TURNOS_INICIALES = Object.freeze([
    { nombre: 'Mañana', hora_inicio: '08:00', hora_fin: '14:00' },
    { nombre: 'Tarde', hora_inicio: '14:00', hora_fin: '20:00' },
    { nombre: 'Noche', hora_inicio: '20:00', hora_fin: '23:00' }
]);

function sembrarTurnos(db) {
    const insertar = db.prepare(`INSERT INTO turnos (nombre, hora_inicio, hora_fin)
        VALUES (?, ?, ?) ON CONFLICT(nombre) DO NOTHING`);
    let nuevos = 0;
    for (const t of TURNOS_INICIALES) {
        nuevos += Number(insertar.run(t.nombre, t.hora_inicio, t.hora_fin).changes);
    }
    return nuevos;
}

function sembrarAdministrador(db, { ADMIN_EMAIL, ADMIN_PASSWORD, PRODUCCION }) {
    const existe = db.prepare('SELECT 1 FROM usuarios WHERE rol = ? OR email = ?')
        .get('superadmin', ADMIN_EMAIL);
    if (existe) return false;

    if (PRODUCCION && ADMIN_PASSWORD === PASSWORD_ADMIN_POR_DEFECTO) {
        console.warn('[seguridad] Estás usando la contraseña inicial del administrador en producción. Define ADMIN_PASSWORD.');
    }

    db.prepare(`INSERT INTO usuarios (nombre, email, password_hash, rol, debe_cambiar_password)
        VALUES (?, ?, ?, 'superadmin', 1)`)
        .run('Administrador', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD));
    return true;
}

function sembrarProductos(db, config) {
    const crudos = JSON.parse(fs.readFileSync(config.ARCHIVO_CATALOGO, 'utf8'));
    if (!Array.isArray(crudos)) throw new Error('El catálogo debe ser un arreglo JSON.');

    const productos = crudos.map(normalizarProducto);
    const ids = new Set();
    for (const p of productos) {
        if (ids.has(p.id)) throw new Error(`Catálogo: el id ${p.id} está repetido.`);
        ids.add(p.id);
    }

    const insertar = db.prepare(`INSERT INTO productos
        (id, nombre, descripcion, imagen, precio, medida, popular, stock, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`);

    const stock = config.STOCK_INICIAL;
    let nuevos = 0;
    db.exec('BEGIN');
    try {
        for (const p of productos) {
            const r = insertar.run(p.id, p.nombre, p.descripcion, p.imagen, p.precio,
                p.medida, p.popular, stock, stock > 0 ? 'disponible' : 'agotado');
            nuevos += Number(r.changes);
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return nuevos;
}
