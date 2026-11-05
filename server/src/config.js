import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Configuración del servidor. Los valores sensibles se leen de variables de
 * entorno; los valores por defecto sirven para desarrollo y calificación.
 */
export const CONFIG = Object.freeze({
    RAIZ,
    PUERTO: Number(process.env.PORT) || 3000,
    DB_PATH: process.env.DB_PATH || path.join(RAIZ, 'data', 'c8licores.db'),
    PRODUCCION: process.env.NODE_ENV === 'production',
    ARCHIVO_CATALOGO: path.join(RAIZ, 'json', 'tarjetas.json'),
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@universidad.com',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin1234*',
    /** Existencias con las que se crean los productos del JSON la primera vez. */
    STOCK_INICIAL: Number(process.env.SEED_STOCK_INICIAL ?? 0),
    SESION_HORAS: 12,
    /** Datos de la empresa que aparecen en las facturas. Se dejan vacíos si no se configuran. */
    EMPRESA: Object.freeze({
        nombre: process.env.EMPRESA_NOMBRE || 'C8LICORES',
        nit: process.env.EMPRESA_NIT || '',
        direccion: process.env.EMPRESA_DIRECCION || '',
        cuentaTransferencia: process.env.EMPRESA_CUENTA_TRANSFERENCIA || ''
    })
});

export const PASSWORD_ADMIN_POR_DEFECTO = 'Admin1234*';
