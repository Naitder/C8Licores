import { randomBytes } from 'node:crypto';
import { ErrorApp } from '../errores.js';
import { hashPassword, hashToken, verificarPassword } from '../seguridad/password.js';
import { erroresVerificacion, validarFechaNacimiento, validarIdentificacion } from './verificacion.js';

const LONGITUD_MINIMA = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Datos del usuario que sí puede ver el cliente (nunca el hash). */
export function aUsuarioPublico(fila) {
    return {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        rol: fila.rol,
        debeCambiarPassword: fila.debe_cambiar_password === 1
    };
}

/** Registro, inicio/cierre de sesión y cambio de contraseña. */
export class AuthServicio {
    #db;
    #auditoria;
    #horas;

    constructor({ db, auditoria, sesionHoras = 12 }) {
        this.#db = db;
        this.#auditoria = auditoria;
        this.#horas = sesionHoras;
    }

    registrar({ nombre, email, password, confirmPassword, fechaNacimiento, identificacion } = {}) {
        const errores = {};
        const correo = String(email ?? '').trim();
        if (!String(nombre ?? '').trim()) errores.nombre = 'El nombre es obligatorio.';
        if (!EMAIL_RE.test(correo)) errores.email = 'Correo electrónico no válido.';
        if (String(password ?? '').length < LONGITUD_MINIMA) {
            errores.password = `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
        }
        if (password !== confirmPassword) errores.confirmPassword = 'Las contraseñas no coinciden.';
        const verificacion = erroresVerificacion({ fechaNacimiento, identificacion });
        if (verificacion.verificacionFecha) errores.fechaNacimiento = verificacion.verificacionFecha;
        if (verificacion.verificacionIdentificacion) errores.identificacion = verificacion.verificacionIdentificacion;
        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);

        if (this.#db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(correo)) {
            throw new ErrorApp(409, 'Este correo electrónico ya está registrado.');
        }

        const { lastInsertRowid } = this.#db.prepare(
            `INSERT INTO usuarios (nombre, email, password_hash, rol, fecha_nacimiento, identificacion)
             VALUES (?, ?, ?, 'cliente', ?, ?)`
        ).run(nombre.trim(), correo, hashPassword(password),
            fechaNacimiento.trim(), identificacion.trim());

        const sesion = this.#abrirSesion(Number(lastInsertRowid));
        this.#auditoria.registrar(sesion.usuario.id, 'registro', 'usuario', sesion.usuario.id);
        return sesion;
    }

    iniciarSesion(identificador, password) {
        const id = String(identificador ?? '').trim();
        const fila = this.#db.prepare('SELECT * FROM usuarios WHERE email = ? OR nombre = ?').get(id, id);
        if (!fila || !verificarPassword(String(password ?? ''), fila.password_hash)) {
            throw new ErrorApp(401, 'El usuario/correo o la contraseña son incorrectos.');
        }
        if (fila.activo !== 1) {
            throw new ErrorApp(403, 'Esta cuenta está suspendida. Contacta al administrador.');
        }
        const sesion = this.#abrirSesion(fila.id);
        this.#auditoria.registrar(fila.id, 'inicio_sesion', 'usuario', fila.id);
        return sesion;
    }

    /** Devuelve el usuario asociado a un token válido, o null. */
    usuarioDesdeToken(token) {
        const fila = this.#db.prepare(`SELECT u.* FROM sesiones s
                JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`)
            .get(hashToken(token), new Date().toISOString());
        return fila ? aUsuarioPublico(fila) : null;
    }

    cerrarSesion(token, usuario) {
        this.#db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
        this.#auditoria.registrar(usuario.id, 'cierre_sesion', 'usuario', usuario.id);
    }

    /** Datos de la cuenta que la persona ve y puede editar en su perfil. */
    perfil(usuario) {
        const f = this.#db.prepare(`SELECT nombre, email, rol, telefono, fecha_nacimiento, identificacion
            FROM usuarios WHERE id = ?`).get(usuario.id);
        return {
            nombre: f.nombre,
            email: f.email,
            rol: f.rol,
            telefono: f.telefono ?? null,
            fechaNacimiento: f.fecha_nacimiento ?? null,
            identificacion: f.identificacion ?? null,
            fechaBloqueada: f.fecha_nacimiento != null,
            identificacionBloqueada: f.identificacion != null
        };
    }

    /**
     * Actualiza nombre, correo y celular. La fecha de nacimiento y la cédula se pueden
     * registrar una sola vez: después no cambian (las corrige el administrador).
     */
    actualizarPerfil(usuario, datos = {}) {
        const actual = this.#db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario.id);
        const errores = {};
        const cambios = {};

        if (datos.nombre !== undefined) {
            const nombre = String(datos.nombre ?? '').trim();
            if (!nombre) errores.nombre = 'El nombre es obligatorio.';
            else cambios.nombre = nombre;
        }
        if (datos.email !== undefined) {
            const correo = String(datos.email ?? '').trim();
            if (!EMAIL_RE.test(correo)) errores.email = 'Correo electrónico no válido.';
            else if (this.#db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?').get(correo, usuario.id)) {
                errores.email = 'Este correo electrónico ya está registrado.';
            } else cambios.email = correo;
        }
        if (datos.telefono !== undefined) {
            const tel = String(datos.telefono ?? '').replace(/[\s-]/g, '');
            if (tel === '') cambios.telefono = null;
            else if (!/^\+?\d{7,15}$/.test(tel)) errores.telefono = 'Indica un número de celular válido (7 a 15 dígitos).';
            else cambios.telefono = tel;
        }
        const fecha = String(datos.fechaNacimiento ?? '').trim();
        if (fecha !== '' && fecha !== actual.fecha_nacimiento) {
            if (actual.fecha_nacimiento) {
                errores.fechaNacimiento = 'La fecha de nacimiento ya está registrada y no se puede cambiar. Escribe al administrador si hay un error.';
            } else {
                const mensaje = validarFechaNacimiento(fecha);
                if (mensaje) errores.fechaNacimiento = mensaje;
                else cambios.fecha_nacimiento = fecha;
            }
        }
        const cedula = String(datos.identificacion ?? '').trim();
        if (cedula !== '' && cedula !== actual.identificacion) {
            if (actual.identificacion) {
                errores.identificacion = 'La cédula ya está registrada y no se puede cambiar. Escribe al administrador si hay un error.';
            } else {
                const mensaje = validarIdentificacion(cedula);
                if (mensaje) errores.identificacion = mensaje;
                else cambios.identificacion = cedula;
            }
        }

        if (Object.keys(errores).length) throw new ErrorApp(400, 'Datos no válidos.', errores);
        const columnas = Object.keys(cambios);
        if (columnas.length) {
            const sets = columnas.map(c => `${c} = ?`).join(', ');
            this.#db.prepare(`UPDATE usuarios SET ${sets}, actualizado_en = datetime('now') WHERE id = ?`)
                .run(...columnas.map(c => cambios[c]), usuario.id);
            this.#auditoria.registrar(usuario.id, 'actualizar_perfil', 'usuario', usuario.id, { campos: columnas });
        }
        return this.perfil(usuario);
    }

    cambiarPassword(usuario, actual, nueva) {
        const fila = this.#db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(usuario.id);
        if (!verificarPassword(String(actual ?? ''), fila.password_hash)) {
            throw new ErrorApp(400, 'Datos no válidos.', { actual: 'La contraseña actual no es correcta.' });
        }
        if (String(nueva ?? '').length < LONGITUD_MINIMA) {
            throw new ErrorApp(400, 'Datos no válidos.', { nueva: `La nueva contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.` });
        }
        if (nueva === actual) {
            throw new ErrorApp(400, 'Datos no válidos.', { nueva: 'La nueva contraseña debe ser distinta a la actual.' });
        }
        this.#db.prepare(`UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0,
                actualizado_en = datetime('now') WHERE id = ?`)
            .run(hashPassword(nueva), usuario.id);
        this.#auditoria.registrar(usuario.id, 'cambio_password', 'usuario', usuario.id);
    }

    #abrirSesion(usuarioId) {
        const token = randomBytes(32).toString('hex');
        const expira = new Date(Date.now() + this.#horas * 3600_000).toISOString();
        this.#db.prepare('DELETE FROM sesiones WHERE expira_en < ?').run(new Date().toISOString());
        this.#db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)')
            .run(hashToken(token), usuarioId, expira);
        const fila = this.#db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
        return { token, usuario: aUsuarioPublico(fila), expiraEn: expira };
    }
}
