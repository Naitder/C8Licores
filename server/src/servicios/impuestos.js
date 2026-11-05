/** IVA general en Colombia. Se aplica sobre el valor después de promociones y descuentos. */
export const TASA_IVA = 0.19;

/**
 * Desglosa un valor base (sin IVA) en IVA y total con IVA.
 * Redondea el IVA al peso; es la única regla de impuestos del sistema.
 */
export function desglosarIva(base) {
    const iva = Math.round(base * TASA_IVA);
    return { subtotal: base, iva, total: base + iva };
}
