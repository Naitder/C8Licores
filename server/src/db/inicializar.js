import { abrirBaseDatos } from './conexion.js';
import { migrar } from './migraciones.js';
import { sembrarDatos } from './seed.js';

/** Abre la base, aplica migraciones pendientes y ejecuta la carga inicial. */
export function inicializarBaseDatos(config) {
    const db = abrirBaseDatos(config.DB_PATH);
    migrar(db);
    const resultado = sembrarDatos(db, config);
    if (resultado.productosNuevos > 0) {
        console.log(`[seed] ${resultado.productosNuevos} producto(s) cargados desde el catálogo.`);
    }
    if (resultado.administradorCreado) {
        console.log(`[seed] Superadministrador creado: ${config.ADMIN_EMAIL}. Deberá cambiar su contraseña al ingresar.`);
    }
    return db;
}
