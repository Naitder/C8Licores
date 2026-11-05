import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Abre (o crea) la base SQLite. Usa el módulo integrado de Node.js, así no
 * hay dependencias nativas que compilar en Windows, Linux o Render.
 */
export function abrirBaseDatos(ruta) {
    if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const db = new DatabaseSync(ruta);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (ruta !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
    return db;
}
