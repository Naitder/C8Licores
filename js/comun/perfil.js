import { llamar } from './llamada.js';
import { informar, pedirDatosFactura } from './dialogo.js';

/**
 * Perfil de cualquier cuenta (cliente, vendedor o administrador): información,
 * pedidos realizados, guardados y facturas. Lo usan la página de perfil del
 * cliente y la sección "Mi perfil" de los paneles.
 */

const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const ETIQUETAS_ESTADO = { pendiente_pago: 'Pendiente de pago', completado: 'Completado', cancelado: 'Cancelado' };
const ETIQUETAS_PAGO = { contra_entrega: 'Contra entrega', transferencia: 'Transferencia', manual: 'Pago manual' };
const PESTANAS = [
    ['informacion', 'Información'],
    ['pedidos', 'Pedidos realizados'],
    ['guardados', 'Guardados'],
    ['facturas', 'Facturas']
];

function el(tag, { clase, texto, ...atributos } = {}, ...hijos) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    for (const [clave, valor] of Object.entries(atributos)) {
        if (valor === undefined || valor === null || valor === false) continue;
        if (typeof valor === 'function') nodo.addEventListener(clave.replace(/^on/, ''), valor);
        else nodo.setAttribute(clave, valor === true ? '' : valor);
    }
    hijos.forEach(h => { if (h !== null && h !== undefined && h !== false) nodo.append(h); });
    return nodo;
}

const fechaLocal = (texto) => texto
    ? new Date(texto.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
    : '';

/** Monta el perfil dentro de `contenedor`. */
export async function montarPerfil(contenedor) {
    contenedor.innerHTML = '';

    const botones = new Map();
    const paneles = new Map();
    const barra = el('nav', { clase: 'perfil-pestanas', 'aria-label': 'Secciones del perfil' });
    for (const [clave, texto] of PESTANAS) {
        const boton = el('button', { type: 'button', clase: 'perfil-pestana', texto });
        botones.set(clave, boton);
        barra.append(boton);
        paneles.set(clave, el('section', { clase: 'perfil-panel oculto' }));
    }
    contenedor.append(barra, ...paneles.values());

    let mios = null;
    const cargarMios = async (forzar = false) => {
        if (forzar || mios === null) mios = (await llamar('/pedidos/mios')).pedidos;
        return mios;
    };

    const pintar = {
        informacion: () => pintarInformacion(paneles.get('informacion')),
        pedidos: async () => pintarPedidos(paneles.get('pedidos'), await cargarMios(), async () => {
            mios = null;
            await pintar.pedidos();
        }),
        guardados: () => pintarGuardados(paneles.get('guardados')),
        facturas: async () => pintarFacturas(paneles.get('facturas'), await cargarMios())
    };

    const mostrar = async (clave) => {
        botones.forEach((b, k) => b.classList.toggle('activa', k === clave));
        paneles.forEach((p, k) => p.classList.toggle('oculto', k !== clave));
        try {
            await pintar[clave]();
        } catch (error) {
            paneles.get(clave).replaceChildren(el('p', { clase: 'perfil-error', texto: error.message }));
        }
    };
    botones.forEach((boton, clave) => boton.addEventListener('click', () => mostrar(clave)));
    await mostrar('informacion');
}

/* ---------- Información ---------- */

async function pintarInformacion(panel) {
    const { perfil: p } = await llamar('/auth/perfil');
    const bloqueada = p.fechaBloqueada || p.identificacionBloqueada;
    const mensaje = el('p', { clase: 'perfil-mensaje', 'aria-live': 'polite' });

    const campo = (etiqueta, atributos, ayuda = null) => el('label', { clase: 'perfil-campo' },
        el('span', { texto: etiqueta }), el('input', atributos), ayuda ? el('small', { texto: ayuda }) : null);

    const inputFecha = el('input', { name: 'fecha', type: 'date', value: p.fechaNacimiento ?? '', disabled: p.fechaBloqueada });
    const inputCedula = el('input', { name: 'cedula', type: 'text', inputmode: 'numeric', maxlength: 10,
        value: p.identificacion ?? '', disabled: p.identificacionBloqueada });

    const formulario = el('form', { clase: 'perfil-formulario' },
        el('h3', { texto: 'Datos personales' }),
        campo('Nombre completo', { name: 'nombre', type: 'text', required: true, maxlength: 80, value: p.nombre }),
        campo('Correo electrónico', { name: 'email', type: 'email', required: true, value: p.email }),
        campo('Celular de contacto', { name: 'telefono', type: 'tel', value: p.telefono ?? '', placeholder: 'Ej: 3001234567' },
            'Para coordinar la entrega de tu pedido.'),
        el('label', { clase: 'perfil-campo' }, el('span', { texto: 'Fecha de nacimiento' }), inputFecha),
        el('label', { clase: 'perfil-campo' }, el('span', { texto: 'Cédula' }), inputCedula),
        el('p', { clase: 'perfil-ayuda',
            texto: bloqueada
                ? 'La fecha de nacimiento y la cédula se registran una sola vez. Si hay un error, escribe al administrador.'
                : 'La fecha de nacimiento y la cédula se registran una sola vez y después no se pueden cambiar.' }),
        mensaje,
        el('button', { type: 'submit', clase: 'perfil-boton', texto: 'Guardar cambios' })
    );

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const datos = {
            nombre: formulario.nombre.value.trim(),
            email: formulario.email.value.trim(),
            telefono: formulario.telefono.value.trim()
        };
        if (!p.fechaBloqueada) datos.fechaNacimiento = inputFecha.value;
        if (!p.identificacionBloqueada) datos.identificacion = inputCedula.value.trim();
        try {
            await llamar('/auth/perfil', 'PUT', datos);
            mensaje.className = 'perfil-mensaje ok';
            mensaje.textContent = 'Cambios guardados.';
            setTimeout(() => pintarInformacion(panel), 600);
        } catch (error) {
            mensaje.className = 'perfil-mensaje error';
            mensaje.textContent = Object.values(error.detalles ?? {}).join(' ') || error.message;
        }
    });

    panel.replaceChildren(formulario, formularioPassword());
}

function formularioPassword() {
    const mensaje = el('p', { clase: 'perfil-mensaje', 'aria-live': 'polite' });
    const formulario = el('form', { clase: 'perfil-formulario' },
        el('h3', { texto: 'Cambiar contraseña' }),
        el('label', { clase: 'perfil-campo' }, el('span', { texto: 'Contraseña actual' }),
            el('input', { name: 'actual', type: 'password', required: true, autocomplete: 'current-password' })),
        el('label', { clase: 'perfil-campo' }, el('span', { texto: 'Nueva contraseña' }),
            el('input', { name: 'nueva', type: 'password', required: true, minlength: 6, autocomplete: 'new-password' })),
        el('label', { clase: 'perfil-campo' }, el('span', { texto: 'Repite la nueva contraseña' }),
            el('input', { name: 'confirmar', type: 'password', required: true, minlength: 6, autocomplete: 'new-password' })),
        mensaje,
        el('button', { type: 'submit', clase: 'perfil-boton', texto: 'Cambiar contraseña' })
    );
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (formulario.nueva.value !== formulario.confirmar.value) {
            mensaje.className = 'perfil-mensaje error';
            mensaje.textContent = 'La nueva contraseña y su repetición no coinciden.';
            return;
        }
        try {
            await llamar('/auth/cambiar-password', 'POST', { actual: formulario.actual.value, nueva: formulario.nueva.value });
            formulario.reset();
            mensaje.className = 'perfil-mensaje ok';
            mensaje.textContent = 'Contraseña cambiada.';
        } catch (error) {
            mensaje.className = 'perfil-mensaje error';
            mensaje.textContent = Object.values(error.detalles ?? {}).join(' ') || error.message;
        }
    });
    return formulario;
}

/* ---------- Pedidos realizados y facturas ---------- */

function pintarPedidos(panel, pedidos, alCambiar) {
    if (pedidos.length === 0) {
        panel.replaceChildren(el('p', { clase: 'perfil-vacio', texto: 'Aún no has hecho pedidos.' }));
        return;
    }
    panel.replaceChildren(...pedidos.map(p => {
        const acciones = el('div', { clase: 'perfil-acciones' });
        if (p.facturaNumero) {
            acciones.append(el('a', { href: `/api/pedidos/${p.id}/factura`, target: '_blank', rel: 'noopener',
                texto: `Descargar ${p.facturaNumero} (PDF)` }));
        }
        if (!p.facturaPedidaPorCliente) {
            acciones.append(el('button', { type: 'button', texto: 'Pedir que salga con mis datos', onclick: () => pedirFactura(p, alCambiar) }));
        }
        return el('article', { clase: 'perfil-item' },
            el('h3', { texto: `Pedido #${p.id}` }),
            el('p', { texto: `${fechaLocal(p.creadoEn)} · ${ETIQUETAS_ESTADO[p.estado] ?? p.estado}` }),
            el('p', { texto: `${dinero.format(p.total)} (incluye IVA) · ${ETIQUETAS_PAGO[p.metodoPago] ?? p.metodoPago}` }),
            el('p', { clase: 'perfil-ayuda', texto: `Entrega: ${p.direccion}` }),
            acciones);
    }));
}

async function pedirFactura(pedido, alCambiar) {
    const { perfil } = await llamar('/auth/perfil');
    const datos = await pedirDatosFactura({
        nombre: perfil.nombre,
        identificacion: perfil.identificacion ?? '',
        total: dinero.format(pedido.total)
    });
    if (!datos) return;
    try {
        const { numero } = await llamar(`/pedidos/${pedido.id}/factura`, 'POST', datos);
        await informar({
            titulo: 'Factura lista',
            mensajes: [`Tu factura es ${numero}. Ya sale con tus datos.`],
            enlace: { href: `/api/pedidos/${pedido.id}/factura`, texto: `Descargar ${numero} (PDF)` }
        });
        await alCambiar();
    } catch (error) {
        await informar({ titulo: 'No se pudo pedir la factura', mensajes: [error.message] });
    }
}

function pintarFacturas(panel, pedidos) {
    const conFactura = pedidos.filter(p => p.facturaNumero);
    if (conFactura.length === 0) {
        panel.replaceChildren(el('p', { clase: 'perfil-vacio', texto: 'Todavía no tienes facturas.' }));
        return;
    }
    panel.replaceChildren(el('table', { clase: 'perfil-tabla' },
        el('thead', {}, el('tr', {},
            ...['Factura', 'Fecha', 'Pedido', 'Pago', 'Total'].map(t => el('th', { texto: t })))),
        el('tbody', {}, ...conFactura.map(p => el('tr', {},
            el('td', {}, el('a', { href: `/api/pedidos/${p.id}/factura`, target: '_blank', rel: 'noopener', texto: p.facturaNumero })),
            el('td', { texto: fechaLocal(p.creadoEn) }),
            el('td', { texto: `#${p.id}` }),
            el('td', { texto: ETIQUETAS_PAGO[p.metodoPago] ?? p.metodoPago }),
            el('td', { texto: dinero.format(p.total) }))))));
}

/* ---------- Guardados ---------- */

async function pintarGuardados(panel) {
    const { favoritos } = await llamar('/favoritos');
    if (favoritos.length === 0) {
        panel.replaceChildren(el('div', { clase: 'perfil-vacio-bloque' },
            el('strong', { texto: 'Aún no tienes productos guardados' }),
            el('p', { clase: 'perfil-ayuda', texto: 'En la tienda pulsa «Guardar» en los productos que te interesen.' }),
            el('a', { clase: 'perfil-boton', href: 'index_productos.html', texto: 'Ir a la tienda' })));
        return;
    }
    panel.replaceChildren(el('div', { clase: 'guardados-grid' }, ...favoritos.map(f => tarjetaGuardado(f, panel))));
}

function tarjetaGuardado(f, panel) {
    const conPromocion = f.precioFinal < f.precio;
    const quitar = el('button', { type: 'button', clase: 'guardado-quitar', texto: 'Quitar', onclick: async (evento) => {
        evento.currentTarget.disabled = true;
        try {
            await llamar(`/favoritos/${f.id}`, 'DELETE');
            await pintarGuardados(panel);
        } catch (error) {
            evento.currentTarget.disabled = false;
            await informar({ titulo: 'No se pudo quitar', mensajes: [error.message] });
        }
    } });
    return el('article', { clase: 'guardado-tarjeta' },
        el('div', { clase: 'guardado-imagen' },
            f.imagen
                ? el('img', { src: f.imagen, alt: f.nombre, loading: 'lazy' })
                : el('div', { clase: 'guardado-sinimagen', texto: f.nombre.charAt(0).toUpperCase() }),
            el('span', { clase: `chip ${f.disponible ? 'chip-disponible' : 'chip-agotado'}`,
                texto: f.disponible ? 'Disponible' : 'Agotado' })),
        el('div', { clase: 'guardado-cuerpo' },
            el('h3', { texto: f.nombre }),
            f.promocion ? el('span', { clase: 'chip chip-promo', texto: f.promocion.texto }) : null,
            el('div', { clase: 'guardado-precio' },
                conPromocion ? el('s', { texto: dinero.format(f.precio) }) : null,
                el('strong', { texto: dinero.format(f.precioFinal) }))),
        el('div', { clase: 'guardado-acciones' },
            el('a', { href: 'index_productos.html', clase: 'guardado-ver', texto: 'Ver en tienda' }),
            quitar));
}
