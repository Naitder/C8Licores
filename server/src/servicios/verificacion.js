import { ErrorApp } from '../errores.js';

/** Edad mínima para comprar licor. */
export const EDAD_MINIMA = 18;

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano), AAAA-MM-DD. */
export function hoyEnBogota(ahora = new Date()) {
    return new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Años cumplidos a una fecha dada. */
export function edadCumplida(fechaNacimiento, hoy = hoyEnBogota()) {
    const [ay, am, ad] = fechaNacimiento.split('-').map(Number);
    const [hy, hm, hd] = hoy.split('-').map(Number);
    let edad = hy - ay;
    if (hm < am || (hm === am && hd < ad)) edad -= 1;
    return edad;
}

/** Mensaje de error si la fecha no sirve para comprar licor, o null. */
export function validarFechaNacimiento(valor) {
    const fecha = String(valor ?? '').trim();
    const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(fecha + 'T00:00:00Z'));
    if (!formatoValido) return 'Indica la fecha de nacimiento.';
    if (fecha > hoyEnBogota()) return 'La fecha de nacimiento no puede ser futura.';
    if (edadCumplida(fecha) < EDAD_MINIMA) return `Solo se vende licor a mayores de ${EDAD_MINIMA} años.`;
    return null;
}

/** Mensaje de error si la cédula no es válida, o null. */
export function validarIdentificacion(valor) {
    return /^\d{6,10}$/.test(String(valor ?? '').trim())
        ? null
        : 'Indica la cédula (solo números, 6 a 10 dígitos).';
}

/** Errores de verificación de edad, con las claves que usan los formularios de compra. */
export function erroresVerificacion(verificacion) {
    const errores = {};
    const fecha = validarFechaNacimiento(verificacion?.fechaNacimiento);
    const identificacion = validarIdentificacion(verificacion?.identificacion);
    if (fecha) errores.verificacionFecha = fecha;
    if (identificacion) errores.verificacionIdentificacion = identificacion;
    return errores;
}

/**
 * Verifica que quien compra sea mayor de edad: fecha de nacimiento y cédula.
 * Se exige en cada compra web y en cada venta en tienda.
 */
export function verificarMayorEdad(verificacion) {
    const errores = erroresVerificacion(verificacion);
    if (Object.keys(errores).length) throw new ErrorApp(400, 'No se puede completar la venta.', errores);
    return {
        fechaNacimiento: String(verificacion.fechaNacimiento).trim(),
        identificacion: String(verificacion.identificacion).trim()
    };
}
