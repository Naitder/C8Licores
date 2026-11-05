/** Error con código HTTP y detalles opcionales para el cliente. */
export class ErrorApp extends Error {
    constructor(status, mensaje, detalles = null) {
        super(mensaje);
        this.name = 'ErrorApp';
        this.status = status;
        this.detalles = detalles;
    }
}
