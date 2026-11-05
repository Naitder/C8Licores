/**
 * Ventanas emergentes (elemento <dialog>) para confirmaciones y para pedir datos.
 * Reemplazan a alert(): el texto se escribe con textContent (seguro frente a HTML).
 */

function nodo(tag, props = {}, ...hijos) {
    const e = document.createElement(tag);
    for (const [clave, valor] of Object.entries(props)) {
        if (valor === undefined || valor === null || valor === false) continue;
        if (clave === 'class') e.className = valor;
        else if (clave.startsWith('on')) e.addEventListener(clave.slice(2), valor);
        else if (clave in e) e[clave] = valor;
        else e.setAttribute(clave, valor === true ? '' : valor);
    }
    e.append(...hijos.flat().filter(h => h !== null && h !== undefined && h !== false));
    return e;
}

/** Abre una ventana con el contenido dado y la quita del documento al cerrarla. */
function abrir(contenido) {
    return new Promise(resolver => {
        const dialogo = nodo('dialog', { class: 'dialogo' }, contenido);
        document.body.append(dialogo);
        dialogo.addEventListener('close', () => {
            dialogo.remove();
            resolver(dialogo.returnValue);
        });
        dialogo.showModal();
    });
}

/**
 * Aviso con botón "Entendido".
 * @param {{ titulo: string, mensajes?: string[] }} opciones
 * @returns {Promise<void>} cuando el usuario cierra la ventana
 */
export function informar({ titulo, mensajes = [], enlace = null }) {
    const contenido = nodo('form', { method: 'dialog', class: 'dialogo-cuerpo' },
        nodo('h2', { class: 'dialogo-titulo', textContent: titulo }),
        ...mensajes.map(texto => nodo('p', { textContent: texto })),
        enlace ? nodo('p', {}, nodo('a', { href: enlace.href, target: '_blank', rel: 'noopener', class: 'dialogo-enlace', textContent: enlace.texto })) : null,
        nodo('div', { class: 'dialogo-acciones' },
            nodo('button', { value: 'ok', class: 'dialogo-boton', textContent: 'Entendido' })));
    return abrir(contenido).then(() => undefined);
}

/**
 * Pregunta de sí o no dentro de la página (reemplaza a confirm()).
 * @param {{ titulo: string, mensajes?: string[], aceptar?: string }} opciones
 * @returns {Promise<boolean>} true si el usuario acepta; false si cancela o cierra
 */
export function confirmar({ titulo, mensajes = [], aceptar = 'Aceptar' }) {
    const contenido = nodo('form', { method: 'dialog', class: 'dialogo-cuerpo' },
        nodo('h2', { class: 'dialogo-titulo', textContent: titulo }),
        ...mensajes.map(texto => nodo('p', { textContent: texto })),
        nodo('div', { class: 'dialogo-acciones' },
            nodo('button', { value: 'cancelar', class: 'dialogo-boton secundario', textContent: 'Cancelar' }),
            nodo('button', { value: 'ok', class: 'dialogo-boton', textContent: aceptar })));
    return abrir(contenido).then(valor => valor === 'ok');
}

/**
 * Pide nombre e identificación para la factura estándar.
 * @returns {Promise<{ nombre: string, identificacion: string } | null>} null si cancela
 */
export function pedirDatosFactura({ nombre = '', identificacion = '', total = null } = {}) {
    const campoNombre = nodo('input', { name: 'nombre', required: true, maxLength: 80, value: nombre, autocomplete: 'off' });
    const campoId = nodo('input', { name: 'identificacion', required: true, maxLength: 20, value: identificacion, autocomplete: 'off', inputMode: 'numeric' });
    const error = nodo('p', { class: 'dialogo-error', role: 'alert' });
    const formulario = nodo('form', { method: 'dialog', class: 'dialogo-cuerpo' },
        nodo('h2', { class: 'dialogo-titulo', textContent: 'Factura estándar' }),
        nodo('p', { textContent: total !== null ? `Total del pedido: ${total}. Se genera una factura estándar (no electrónica).` : 'Se genera una factura estándar (no electrónica).' }),
        nodo('label', {}, 'Nombre o razón social', campoNombre),
        nodo('label', {}, 'Cédula o NIT', campoId),
        error,
        nodo('div', { class: 'dialogo-acciones' },
            nodo('button', { type: 'button', class: 'dialogo-boton secundario', textContent: 'Cancelar', onclick: () => formulario.closest('dialog').close('') }),
            nodo('button', { type: 'submit', value: 'ok', class: 'dialogo-boton', textContent: 'Generar factura' })));

    formulario.addEventListener('submit', (evento) => {
        if (!formulario.checkValidity()) {
            evento.preventDefault();
            error.textContent = 'Completa el nombre y la identificación del cliente.';
            return;
        }
        // El valor se guarda al enviar; el cierre resuelve la promesa.
        formulario.dataset.valores = JSON.stringify({ nombre: campoNombre.value.trim(), identificacion: campoId.value.trim() });
    });

    return abrir(formulario).then(valor => {
        if (valor !== 'ok' || !formulario.dataset.valores) return null;
        return JSON.parse(formulario.dataset.valores);
    });
}
