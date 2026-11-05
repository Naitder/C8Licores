import { ComponenteUI } from '../base/ComponenteUI.js';
import { FilaCarrito } from '../elementos/FilaCarrito.js';
import { CarritoServicio } from '../../servicios/CarritoServicio.js';
import { RUTAS, PARAMETROS } from '../../config/Configuracion.js';
import { informar } from '../../comun/dialogo.js';

/**
 * Página del carrito. El total, las promociones, las existencias y el IVA los
 * calcula el servidor (cotización). Al comprar, el pedido se registra en el
 * servidor y la confirmación aparece en una ventana emergente.
 */
export class VistaCarrito extends ComponenteUI {
    #carrito;
    #formateador;
    #pedidos;
    #sesion;
    #navegador;
    #autenticacion;
    #perfil = null;
    #contenedor;
    #total;
    #descuento;
    #iva;
    #direccion;
    #pago;
    #pedirFactura;
    #nacimiento;
    #cedula;
    #datosFactura;
    #facturaNombre;
    #facturaId;
    #aviso;
    #boton;
    #cotizacion = null;
    #version = 0;
    #comprando = false;

    constructor({ carrito, formateador, pedidos, autenticacion, sesion, navegador, documento }) {
        super(documento);
        this.#carrito = carrito;
        this.#formateador = formateador;
        this.#pedidos = pedidos;
        this.#autenticacion = autenticacion;
        this.#sesion = sesion;
        this.#navegador = navegador;
    }

    estaDisponible() {
        this.#contenedor = this.obtener('carrito-items');
        this.#total = this.obtener('carrito-total');
        this.#descuento = this.obtener('carrito-descuento');
        this.#iva = this.obtener('carrito-iva');
        this.#direccion = this.obtener('carrito-direccion');
        this.#pago = this.obtener('carrito-pago');
        this.#pedirFactura = this.obtener('carrito-factura');
        this.#nacimiento = this.obtener('carrito-nacimiento');
        this.#cedula = this.obtener('carrito-cedula');
        this.#datosFactura = this.obtener('carrito-factura-datos');
        this.#facturaNombre = this.obtener('carrito-factura-nombre');
        this.#facturaId = this.obtener('carrito-factura-id');
        this.#aviso = this.obtener('carrito-aviso');
        this.#boton = this.documento.querySelector('.btn-comprar');
        return Boolean(this.#contenedor && this.#total && this.#boton);
    }

    alMontar() {
        this.#carrito.suscribir(CarritoServicio.EVENTO_CAMBIO, () => this.actualizar());
        this.#boton.addEventListener('click', () => this.#comprar());
        this.#pedirFactura.addEventListener('change', () => this.#mostrarDatosFactura());
        this.#pedirFactura.addEventListener('change', () => this.#rellenarFactura());
        this.#mostrarDatosFactura();
        this.actualizar();
        this.#cargarPerfil();
    }

    /** Los datos de verificación guardados en la cuenta llenan el formulario: no hay que volver a escribirlos. */
    async #cargarPerfil() {
        if (!this.#sesion.estaAutenticado()) return;
        this.#perfil = await this.#autenticacion.obtenerPerfil();
        if (!this.#perfil) return;
        if (this.#perfil.fechaNacimiento && !this.#nacimiento.value) this.#nacimiento.value = this.#perfil.fechaNacimiento;
        if (this.#perfil.identificacion && !this.#cedula.value) this.#cedula.value = this.#perfil.identificacion;
    }

    #rellenarFactura() {
        if (!this.#pedirFactura.checked) return;
        if (!this.#facturaNombre.value) this.#facturaNombre.value = this.#sesion.obtener().nombreUsuario ?? '';
        if (!this.#facturaId.value && this.#perfil?.identificacion) this.#facturaId.value = this.#perfil.identificacion;
    }

    #mostrarDatosFactura() {
        this.#datosFactura.classList.toggle('oculto', !this.#pedirFactura.checked);
        this.#actualizarBoton();
    }

    /** Dibuja las filas y pide al servidor el total actualizado. */
    async actualizar() {
        const items = this.#carrito.obtenerItems();
        this.#cotizacion = null;
        this.#pintar(items);

        if (items.length === 0) {
            this.#actualizarBoton();
            return;
        }

        const version = ++this.#version;
        try {
            const cotizacion = await this.#pedidos.cotizar(items.map(item => item.aLineaPedido()));
            if (version !== this.#version) return;
            this.#cotizacion = cotizacion;
            this.#pintar(items);
            this.#mostrarAviso(cotizacion.disponible ? '' : 'Hay productos sin existencias suficientes. Ajusta tu carrito.', 'error');
        } catch (error) {
            if (version !== this.#version) return;
            this.#mostrarAviso(error.message, 'error');
        }
        this.#actualizarBoton();
    }

    #pintar(items) {
        const lineas = new Map((this.#cotizacion?.lineas ?? []).map(l => [l.productoId, l]));
        this.#contenedor.innerHTML = '';

        if (items.length === 0) {
            this.#contenedor.appendChild(this.crear('p', { clase: 'carrito-vacio', texto: 'Tu carrito está vacío' }));
        } else {
            items.forEach(item => {
                const fila = new FilaCarrito({
                    item,
                    carrito: this.#carrito,
                    formateador: this.#formateador,
                    linea: lineas.get(item.id) ?? null,
                    documento: this.documento
                });
                this.#contenedor.appendChild(fila.renderizar());
            });
        }

        const cot = this.#cotizacion;
        const base = cot ? cot.subtotal : this.#carrito.calcularTotal();
        const iva = cot ? cot.iva : Math.round(base * PARAMETROS.TASA_IVA);
        const total = cot ? cot.total : base + iva;
        this.#total.textContent = this.#formateador.formatearTotal(total);
        this.#iva.textContent = items.length && total
            ? `Incluye IVA (${Math.round(PARAMETROS.TASA_IVA * 100)}%): ${this.#formateador.formatear(iva)}`
            : '';

        const descuento = cot?.descuento ?? 0;
        this.#descuento.hidden = descuento <= 0;
        this.#descuento.textContent = descuento > 0 ? `Ahorras ${this.#formateador.formatear(descuento)}` : '';
    }

    /** El botón solo se activa con un carrito cotizado, disponible y con datos de entrega. */
    #actualizarBoton() {
        const hayItems = this.#carrito.obtenerItems().length > 0;
        this.#boton.disabled = !hayItems || this.#comprando || (this.#cotizacion !== null && !this.#cotizacion.disponible);
    }

    #datosFacturaValidos() {
        if (!this.#pedirFactura.checked) return true;
        return this.#facturaNombre.value.trim().length >= 3 && this.#facturaId.value.trim().length >= 5;
    }

    async #comprar() {
        if (this.#comprando) return;
        if (!this.#sesion.estaAutenticado()) {
            this.#navegador.irA(RUTAS.LOGIN);
            return;
        }

        const direccion = this.#direccion.value.trim();
        if (direccion.length < 5) {
            this.#mostrarAviso('Escribe una dirección de entrega válida.', 'error');
            this.#direccion.focus();
            return;
        }
        if (!this.#nacimiento.value || this.#cedula.value.trim() === '') {
            this.#mostrarAviso('Para comprar licor escribe tu fecha de nacimiento y tu cédula.', 'error');
            return;
        }
        if (!this.#datosFacturaValidos()) {
            this.#mostrarAviso('Para la factura escribe el nombre y la cédula o NIT del cliente.', 'error');
            return;
        }

        const pedirFactura = this.#pedirFactura.checked;
        const factura = pedirFactura
            ? { nombre: this.#facturaNombre.value.trim(), identificacion: this.#facturaId.value.trim() }
            : null;

        this.#comprando = true;
        this.#actualizarBoton();
        this.#mostrarAviso('Registrando tu pedido…', '');
        try {
            const pedido = await this.#pedidos.crear({
                items: this.#carrito.obtenerItems().map(item => item.aLineaPedido()),
                direccion,
                metodoPago: this.#pago.value,
                verificacion: { fechaNacimiento: this.#nacimiento.value, identificacion: this.#cedula.value.trim() },
                factura
            });
            this.#carrito.vaciar();
            this.#direccion.value = '';
            this.#pedirFactura.checked = false;
            this.#facturaNombre.value = '';
            this.#facturaId.value = '';
            this.#mostrarDatosFactura();
            this.#mostrarAviso('', 'ok');
            await informar({ titulo: `Pedido #${pedido.id} registrado`, mensajes: this.#mensajesConfirmacion(pedido) });
        } catch (error) {
            this.#mostrarAviso(error.message, 'error');
            if (error.estado === 409) this.actualizar();
        } finally {
            this.#comprando = false;
            this.#actualizarBoton();
        }
    }

    #mensajesConfirmacion(pedido) {
        const mensajes = [`Total a pagar: ${this.#formateador.formatear(pedido.total)} (incluye IVA).`];
        if (pedido.metodoPago === 'transferencia') {
            mensajes.push(pedido.cuentaTransferencia
                ? `Realiza la transferencia a: ${pedido.cuentaTransferencia}.`
                : 'La tienda te enviará los datos de la cuenta para transferir.');
        }
        mensajes.push('Tu pedido quedó pendiente de pago.');
        if (pedido.facturaNumero) mensajes.push(`Tu factura es ${pedido.facturaNumero}. La puedes descargar en tu perfil, en Facturas.`);
        return mensajes;
    }

    #mostrarAviso(texto, tipo) {
        this.#aviso.textContent = texto;
        this.#aviso.className = `carrito-aviso ${tipo}`;
    }
}
