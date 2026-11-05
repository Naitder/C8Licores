/**
 * Utilidades compartidas por los paneles (administrador y vendedor).
 * Habla solo con /api/... Todo el texto que viene del servidor se muestra con
 * textContent (nunca como HTML), así un nombre de producto no puede inyectar código.
 */

export const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const fechaCorta = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });

export const $ = (id) => document.getElementById(id);

/** Fechas guardadas en UTC por SQLite ('AAAA-MM-DD HH:MM:SS', datetime('now')). */
export const aFecha = (texto) => new Date(texto.replace(' ', 'T') + 'Z');

/** Hora guardada en hora local del servidor ('AAAA-MM-DD HH:MM:SS', localtime) → 'HH:MM'. */
export const horaLocal = (texto) => (texto ? texto.slice(11, 16) : '');

/** Fecha de hoy en el navegador, formato AAAA-MM-DD (para valores por defecto de formularios). */
export function fechaDeHoy(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const ETIQUETAS_PEDIDO = { pendiente_pago: 'Pendiente de pago', completado: 'Completado', cancelado: 'Cancelado' };
export const ETIQUETAS_FORMA_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta (datáfono)', transferencia: 'Transferencia' };

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
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
        const primerDetalle = datos.detalles && !datos.detalles.codigo ? Object.values(datos.detalles)[0] : null;
        const error = new Error(primerDetalle ?? datos.error ?? 'Ocurrió un error inesperado.');
        error.codigo = datos.detalles?.codigo;
        throw error;
    }
    return datos;
}

/** Crea un elemento. Los hijos de texto se insertan como texto seguro. */
export function el(tag, props = {}, ...hijos) {
    const nodo = document.createElement(tag);
    for (const [clave, valor] of Object.entries(props)) {
        if (valor === undefined || valor === null || valor === false) continue;
        if (clave === 'class') nodo.className = valor;
        else if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
        else if (clave in nodo) nodo[clave] = valor;
        else nodo.setAttribute(clave, valor === true ? '' : valor);
    }
    nodo.append(...hijos.flat().filter(h => h !== null && h !== undefined && h !== false));
    return nodo;
}

/** Devuelve la función que muestra avisos en la caja con ese id. */
export function crearAvisos(idCaja) {
    let temporizador;
    return function avisar(mensaje, tipo = 'error') {
        const caja = $(idCaja);
        caja.textContent = mensaje;
        caja.className = `admin-aviso ${tipo === 'ok' ? 'ok' : ''}`;
        caja.classList.remove('oculto');
        clearTimeout(temporizador);
        temporizador = setTimeout(() => caja.classList.add('oculto'), 5000);
    };
}

export function tabla(id, encabezados, filas) {
    $(id).replaceChildren(
        el('thead', {}, el('tr', {}, encabezados.map(h => el('th', { textContent: h })))),
        el('tbody', {}, filas.length
            ? filas
            : el('tr', {}, el('td', { colSpan: encabezados.length, class: 'vacio', textContent: 'Sin registros todavía.' })))
    );
}

/**
 * Menú de tableta y celular: el botón «Menú» despliega las secciones y se cierra al elegir una.
 * En pantalla ancha el botón no se ve y el menú siempre está abierto (lo controla el CSS).
 */
export function montarMenuMovil(boton, menu) {
    if (!boton || !menu) return;
    boton.addEventListener('click', () => {
        const abierto = menu.classList.toggle('abierto');
        boton.setAttribute('aria-expanded', String(abierto));
    });
    menu.addEventListener('click', (evento) => {
        if (!evento.target.closest('.admin-nav button')) return;
        menu.classList.remove('abierto');
        boton.setAttribute('aria-expanded', 'false');
    });
}
