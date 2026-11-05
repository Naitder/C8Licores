/**
 * Fechas y horas. Las operaciones del negocio usan la hora LOCAL del servidor
 * (la tienda opera en Colombia), así que "hoy" y las horas de entrada/salida
 * se calculan con SQLite en modo 'localtime'.
 */

export function hoyLocal(db) {
    return db.prepare(`SELECT date('now', 'localtime') AS fecha`).get().fecha;
}

export function ahoraLocal(db) {
    return db.prepare(`SELECT datetime('now', 'localtime') AS momento`).get().momento;
}

export function esFechaValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto ?? ''))) return false;
    const [a, m, d] = texto.split('-').map(Number);
    const fecha = new Date(Date.UTC(a, m - 1, d));
    return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

export function esHoraValida(texto) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(texto ?? ''));
}
