/**
 * Venta en tienda (presencial), compartida por el vendedor y el administrador.
 * El servidor valida todo: el vendedor necesita entrada abierta; el administrador vende sin turno.
 * Recibe `puedeVender()` (si la venta está habilitada en ese momento) y `avisar(mensaje, tipo)`.
 */
import { $, api, el, tabla, pesos } from './panel.js';

export function montarVenta({ avisar, puedeVender }) {
    const estado = {
        productos: [],        // catálogo para vender
        carrito: new Map(),   // productoId -> { producto, cantidad }
        cotizacion: null,     // respuesta del servidor para el carrito actual
        versionCotizacion: 0
    };

    const lineasCarrito = () => [...estado.carrito.values()]
        .map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad }));
    const totalLocal = () => {
        const base = [...estado.carrito.values()]
            .reduce((suma, { producto, cantidad }) => suma + producto.precioFinal * cantidad, 0);
        return base + Math.round(base * 0.19);
    };

    function pintarCatalogo() {
        const busqueda = $('buscar-producto').value.trim().toLowerCase();
        const visibles = estado.productos
            .filter(p => p.estado !== 'inactivo' && p.nombre.toLowerCase().includes(busqueda));

        tabla('tabla-catalogo', ['Imagen', 'Producto', 'Precio', 'Existencias', ''], visibles.map(p => {
            const enCarrito = estado.carrito.get(p.id)?.cantidad ?? 0;
            const disponibles = p.stock - enCarrito;
            return el('tr', {},
                el('td', {}, el('img', { class: 'miniatura', src: '/' + p.imagen, alt: p.nombre, onerror: (e) => { e.target.style.visibility = 'hidden'; } })),
                el('td', {},
                    el('strong', { textContent: p.nombre }), el('br'),
                    el('small', { textContent: p.medida ?? '' }),
                    p.promocion ? [el('br'), el('span', { class: 'chip chip-disponible', textContent: p.promocion.texto })] : null),
                el('td', { textContent: pesos.format(p.precioFinal) }),
                el('td', { textContent: String(disponibles) }),
                el('td', {}, el('button', {
                    type: 'button',
                    class: 'admin-boton pequeno',
                    textContent: 'Agregar',
                    disabled: disponibles <= 0,
                    onclick: () => agregarAlCarrito(p.id)
                })));
        }));
    }

    /** Cualquier cambio en el carrito: redibuja y vuelve a cotizar en el servidor. */
    function cambiarCarrito() {
        $('enlace-factura-p').classList.add('oculto');
        pintarCatalogo();
        pintarCarrito();
        pintarTotales();
        recotizar();
    }

    async function recotizar() {
        const version = ++estado.versionCotizacion;
        estado.cotizacion = null;
        if (estado.carrito.size === 0) {
            pintarCarrito();
            pintarTotales();
            return;
        }
        try {
            const { cotizacion } = await api('/pedidos/cotizacion', { metodo: 'POST', cuerpo: { items: lineasCarrito() } });
            if (version !== estado.versionCotizacion) return;
            estado.cotizacion = cotizacion;
        } catch (error) {
            if (version !== estado.versionCotizacion) return;
            avisar(error.message);
        }
        pintarCarrito();
        pintarTotales();
    }

    function agregarAlCarrito(id) {
        const producto = estado.productos.find(p => p.id === id);
        const actual = estado.carrito.get(id)?.cantidad ?? 0;
        if (!producto || actual + 1 > producto.stock) {
            avisar(`Solo hay ${producto?.stock ?? 0} unidad(es) de ${producto?.nombre ?? 'este producto'}.`);
            return;
        }
        estado.carrito.set(id, { producto, cantidad: actual + 1 });
        cambiarCarrito();
    }

    function pintarCarrito() {
        const lineas = new Map((estado.cotizacion?.lineas ?? []).map(l => [l.productoId, l]));
        const filas = [...estado.carrito.values()].map(({ producto, cantidad }) => {
            const linea = lineas.get(producto.id);
            const campo = el('input', {
                type: 'number', min: '1', max: String(producto.stock), step: '1',
                value: String(cantidad), 'aria-label': `Cantidad de ${producto.nombre}`
            });
            campo.addEventListener('change', () => {
                const n = Math.trunc(Number(campo.value));
                if (!Number.isInteger(n) || n < 1) {
                    campo.value = String(cantidad);
                    return;
                }
                if (n > producto.stock) {
                    avisar(`Solo hay ${producto.stock} unidad(es) de ${producto.nombre}.`);
                    campo.value = String(cantidad);
                    return;
                }
                estado.carrito.set(producto.id, { producto, cantidad: n });
                cambiarCarrito();
            });

            const subtotal = linea ? linea.subtotal : producto.precioFinal * cantidad;
            return el('tr', {},
                el('td', {},
                    producto.nombre,
                    linea?.promocion ? [el('br'), el('small', { class: 'vend-promo', textContent: linea.promocion })] : null,
                    linea && !linea.disponible ? [el('br'), el('small', { class: 'vend-sin-stock', textContent: 'Sin existencias suficientes' })] : null),
                el('td', {}, campo),
                el('td', { textContent: pesos.format(subtotal) }),
                el('td', {}, el('button', {
                    type: 'button',
                    class: 'admin-boton pequeno secundario',
                    textContent: 'Quitar',
                    onclick: () => { estado.carrito.delete(producto.id); cambiarCarrito(); }
                })));
        });
        tabla('tabla-carrito', ['Producto', 'Cant.', 'Subtotal', ''], filas);
    }

    function pintarTotales() {
        const cot = estado.cotizacion;
        const total = cot ? cot.total : totalLocal();
        const efectivo = $('forma-pago').value === 'efectivo';
        const campoRecibido = $('pago-recibido');
        const hayRecibido = campoRecibido.value !== '';
        const recibido = Number(campoRecibido.value);

        $('total-venta').textContent = pesos.format(total);
        $('descuento-venta').textContent = pesos.format(cot?.descuento ?? 0);
        $('iva-venta').textContent = pesos.format(cot ? cot.iva : Math.round(total - total / 1.19));
        $('bloque-efectivo').classList.toggle('oculto', !efectivo);

        let textoCambio = pesos.format(0);
        if (efectivo && hayRecibido) {
            const diferencia = recibido - total;
            textoCambio = diferencia >= 0 ? pesos.format(diferencia) : `Faltan ${pesos.format(-diferencia)}`;
        }
        $('cambio-venta').textContent = textoCambio;

        const pedirFactura = $('pedir-factura').checked;
        $('bloque-factura').classList.toggle('oculto', !pedirFactura);
        const facturaCompleta = !pedirFactura
            || ($('factura-nombre').value.trim() !== '' && $('factura-identificacion').value.trim() !== '');

        const pagoCompleto = !efectivo || (hayRecibido && recibido >= total);
        const sinProblemas = Boolean(cot?.disponible);
        const verificacionCompleta = $('venta-nacimiento').value !== '' && $('venta-cedula').value.trim() !== '';
        $('registrar-venta').disabled = !(total > 0 && puedeVender() && pagoCompleto && facturaCompleta
            && sinProblemas && verificacionCompleta);
    }

    async function registrarVenta(evento) {
        evento.preventDefault();
        const f = evento.target;
        const efectivo = f.formaPago.value === 'efectivo';
        const pedirFactura = $('pedir-factura').checked;
        const cuerpo = {
            verificacion: {
                fechaNacimiento: $('venta-nacimiento').value,
                identificacion: $('venta-cedula').value.trim()
            },
            items: lineasCarrito(),
            formaPago: f.formaPago.value,
            pagoRecibido: efectivo ? Number(f.pagoRecibido.value) : undefined,
            factura: pedirFactura
                ? { nombre: $('factura-nombre').value.trim(), identificacion: $('factura-identificacion').value.trim() }
                : undefined
        };
        try {
            const { venta } = await api('/vendedor/ventas', { metodo: 'POST', cuerpo });
            avisar(venta.cambio > 0
                ? `Venta #${venta.id} registrada. Devuelve ${pesos.format(venta.cambio)} de cambio.`
                : `Venta #${venta.id} registrada por ${pesos.format(venta.total)}.`, 'ok');

            if (venta.facturaNumero) {
                const enlace = $('enlace-factura');
                enlace.href = `/api/pedidos/${venta.id}/factura`;
                enlace.textContent = `Descargar factura ${venta.facturaNumero} (PDF)`;
                $('enlace-factura-p').classList.remove('oculto');
            }

            estado.carrito.clear();
            estado.cotizacion = null;
            f.reset();
            $('pedir-factura').checked = false;
            await cargar();
            pintarTotales();
        } catch (error) {
            avisar(error.message);
        }
    }

    function vaciarVenta() {
        estado.carrito.clear();
        estado.cotizacion = null;
        $('form-venta').reset();
        $('pedir-factura').checked = false;
        $('enlace-factura-p').classList.add('oculto');
        cambiarCarrito();
    }



    /** Carga el catálogo para vender y redibuja la venta. */
    async function cargar() {
        const { productos } = await api('/vendedor/productos');
        estado.productos = productos;
        pintarCatalogo();
        pintarCarrito();
        pintarTotales();
    }

    /** Vuelve a calcular si se puede registrar (p. ej. al cambiar la jornada). */
    function refrescar() {
        pintarTotales();
    }

    /** Enlaza los controles de la sección «Venta en tienda». Llamar una sola vez. */
    function iniciar() {
        $('buscar-producto').addEventListener('input', pintarCatalogo);
        $('forma-pago').addEventListener('change', pintarTotales);
        $('pago-recibido').addEventListener('input', pintarTotales);
        $('pedir-factura').addEventListener('change', pintarTotales);
        $('venta-nacimiento').addEventListener('input', pintarTotales);
        $('venta-cedula').addEventListener('input', pintarTotales);
        $('factura-nombre').addEventListener('input', pintarTotales);
        $('factura-identificacion').addEventListener('input', pintarTotales);
        $('form-venta').addEventListener('submit', registrarVenta);
        $('vaciar-venta').addEventListener('click', vaciarVenta);
    }

    return { cargar, refrescar, iniciar };
}
