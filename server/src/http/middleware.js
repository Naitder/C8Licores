import { ErrorApp } from '../errores.js';

export const NOMBRE_COOKIE = 'sid';

/** Rutas que un usuario con contraseña temporal sí puede usar. */
const RUTAS_CON_CAMBIO_PENDIENTE = new Set([
    '/api/auth/me',
    '/api/auth/logout',
    '/api/auth/cambiar-password'
]);

export function leerCookie(req, nombre) {
    for (const parte of (req.headers.cookie ?? '').split(';')) {
        const [clave, ...valor] = parte.trim().split('=');
        if (clave === nombre) return decodeURIComponent(valor.join('='));
    }
    return null;
}

/** Carga req.usuario (o null) a partir de la cookie de sesión. */
export function cargarUsuario(auth) {
    return (req, res, next) => {
        const token = leerCookie(req, NOMBRE_COOKIE);
        req.tokenSesion = token;
        req.usuario = token ? auth.usuarioDesdeToken(token) : null;
        next();
    };
}

export function requerirSesion(req, res, next) {
    if (!req.usuario) return next(new ErrorApp(401, 'Debes iniciar sesión.'));
    const ruta = req.originalUrl.split('?')[0];
    if (req.usuario.debeCambiarPassword && !RUTAS_CON_CAMBIO_PENDIENTE.has(ruta)) {
        return next(new ErrorApp(403, 'Debes cambiar tu contraseña temporal antes de continuar.', {
            codigo: 'CAMBIO_PASSWORD_REQUERIDO'
        }));
    }
    next();
}

/** Valida sesión y rol en el servidor. El frontend no es una barrera de seguridad. */
export function requerirRol(...roles) {
    return (req, res, next) => {
        requerirSesion(req, res, (error) => {
            if (error) return next(error);
            if (!roles.includes(req.usuario.rol)) {
                return next(new ErrorApp(403, 'No tienes permiso para realizar esta acción.'));
            }
            next();
        });
    };
}
