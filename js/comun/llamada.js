/**
 * Llamada JSON a la API. Lanza un Error con el primer mensaje útil del servidor
 * (detalles de validación, o el error general).
 */
export async function llamar(ruta, metodo = 'GET', cuerpo) {
    let respuesta;
    try {
        respuesta = await fetch('/api' + ruta, {
            method: metodo,
            credentials: 'same-origin',
            headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
            body: cuerpo ? JSON.stringify(cuerpo) : undefined
        });
    } catch {
        throw new Error('No se pudo conectar con el servidor.');
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
        const error = new Error(datos.detalles ? Object.values(datos.detalles)[0] : (datos.error ?? 'Ocurrió un error inesperado.'));
        error.estado = respuesta.status;
        error.detalles = datos.detalles ?? {};
        throw error;
    }
    return datos;
}
