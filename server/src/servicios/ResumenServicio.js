/**
 * Indicadores del panel de administración. Solo cuenta y suma datos de la
 * base; no inventa cifras. Los costos y gastos aún no existen en el modelo,
 * por eso aquí solo aparecen ventas, pedidos, productos y clientes.
 */
export class ResumenServicio {
    #db;

    constructor({ db }) {
        this.#db = db;
    }

    obtener() {
        const contar = (sql) => this.#db.prepare(sql).get().n;
        return {
            ingresosTotales: contar(`SELECT COALESCE(SUM(total), 0) AS n FROM pedidos WHERE estado = 'completado'`),
            ingresosHoy: contar(`SELECT COALESCE(SUM(total), 0) AS n FROM pedidos
                WHERE estado = 'completado' AND date(creado_en, 'localtime') = date('now', 'localtime')`),
            pedidosPendientes: contar(`SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'pendiente_pago'`),
            pedidosCompletados: contar(`SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'completado'`),
            productosActivos: contar(`SELECT COUNT(*) AS n FROM productos WHERE estado != 'inactivo'`),
            productosAgotados: contar(`SELECT COUNT(*) AS n FROM productos WHERE estado = 'agotado'`),
            clientesActivos: contar(`SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'cliente' AND activo = 1`)
        };
    }
}
