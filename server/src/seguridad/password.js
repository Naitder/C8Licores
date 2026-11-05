import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Parámetros de scrypt (hash de contraseñas). Se guardan junto al hash. */
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });
const LONGITUD_CLAVE = 64;

/** Devuelve "scrypt$N$r$p$sal$hash". Nunca se guarda la contraseña en claro. */
export function hashPassword(password) {
    const sal = randomBytes(16).toString('hex');
    const clave = scryptSync(String(password), sal, LONGITUD_CLAVE, PARAMS);
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal}$${clave.toString('hex')}`;
}

export function verificarPassword(password, guardado) {
    try {
        const [alg, n, r, p, sal, hex] = String(guardado).split('$');
        if (alg !== 'scrypt') return false;
        const esperado = Buffer.from(hex, 'hex');
        const calculado = scryptSync(String(password), sal, esperado.length, {
            N: Number(n), r: Number(r), p: Number(p)
        });
        return timingSafeEqual(calculado, esperado);
    } catch {
        return false;
    }
}

/** Las sesiones se guardan como hash SHA-256: una fuga de la base no revela tokens activos. */
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
