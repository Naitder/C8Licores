/**
 * Cotización y compra contra el servidor (/api/pedidos).
 * El precio final lo decide siempre el servidor (promociones y existencias);
 * el navegador solo muestra lo que devuelve.
 */
export class PedidosApi {
    #base;

    constructor(base = '/api') {
        this.#base = base;
    }

    /** items: [{ productoId, cantidad }] → { total, descuento, lineas, disponible } */
    async cotizar(items) {
        const { cotizacion } = await this.#solicitar('/pedidos/cotizacion', 'POST', { items });
        return cotizacion;
    }

    /** → pedido creado (requiere sesión). `factura` es opcional: { nombre, identificacion }. */
    async crear({ items, direccion, metodoPago, factura = null, verificacion }) {
        const { pedido } = await this.#solicitar('/pedidos', 'POST', { items, direccion, metodoPago, factura, verificacion });
        return pedido;
    }

    /** Pedidos del usuario con sesión (el administrador ve todos). */
    async listarMios() {
        const { pedidos } = await this.#solicitar('/pedidos', 'GET');
        return pedidos;
    }

    /** Pide la factura de un pedido. Si ya existe, devuelve la misma. → { numero, creada } */
    async solicitarFactura(pedidoId, { nombre, identificacion }) {
        return this.#solicitar(`/pedidos/${pedidoId}/factura`, 'POST', { nombre, identificacion });
    }

    async #solicitar(ruta, metodo, cuerpo) {
        let respuesta;
        try {
            respuesta = await fetch(this.#base + ruta, {
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
            const primerDetalle = datos.detalles ? Object.values(datos.detalles)[0] : null;
            const error = new Error(primerDetalle ?? datos.error ?? 'Ocurrió un error inesperado.');
            error.estado = respuesta.status;
            throw error;
        }
        return datos;
    }
}
