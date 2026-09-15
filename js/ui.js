import { agregarProducto, existeProducto } from './carrito.js';
import { filtrarPorSimilitud } from './buscadorUtils.js';

// =============================================
// PÁGINA PRINCIPAL: Renderizado del Slider Dinámico
// =============================================
export function renderizarProducto(producto, index) {
    const container = document.getElementById('hero-container');
    const titulo = document.getElementById('titulo-principal');
    const imagen = document.getElementById('img-dinamica');
    const puntos = document.querySelectorAll('.punto');

    if (!container || !titulo || !imagen) return; // Escudo por si no estamos en el index

    container.className = producto.clase;
    titulo.innerHTML = producto.titulo;
    imagen.src = producto.imagen;

    puntos.forEach(function(punto, i) {
        if (i === index) {
            punto.classList.add('active');
        } else {
            punto.classList.remove('active');
        }
    });
}

// =============================================
// GLOBAL: Control del menú hamburguesa (Móvil)
// =============================================
export function inicializarMenuHamburguesa() {
    const menuToggle = document.getElementById('menu-toggle');
    const navBotones = document.getElementById('nav-botones');

    if (!menuToggle || !navBotones) return;

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        navBotones.classList.toggle('activo');
    });

    document.querySelectorAll('.nav-botones a').forEach(enlace => {
        enlace.addEventListener('click', () => {
            navBotones.classList.remove('activo');
        });
    });

    document.addEventListener('click', (e) => {
        if (!navBotones.contains(e.target) && e.target !== menuToggle) {
            navBotones.classList.remove('activo');
        }
    });
}

// =============================================
// Generar tarjetas desde JSON
// =============================================
export function renderizarTarjetas(listaTarjetas) {
  const contenedor = document.getElementById('seccion-tarjetas');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  listaTarjetas.forEach(tarjeta => {
    const card = document.createElement('div');
    card.classList.add('card');
    // Si es popular, añadimos una clase extra
    if (tarjeta.popular) {
      card.classList.add('card-popular');
    }

    const img = document.createElement('img');
    img.src = tarjeta.imagen;
    img.alt = tarjeta.titulo || tarjeta.nombre; // Usa titulo o nombre
    img.classList.add('card-img');

    const titulo = document.createElement('h3');
    titulo.textContent = tarjeta.titulo || tarjeta.nombre; // Fallback a nombre
    titulo.classList.add('card-titulo');

    // Descripción: si no existe, mostramos la medida
    const descripcion = document.createElement('p');
    descripcion.textContent = tarjeta.descripcion || tarjeta.medida || '';
    descripcion.classList.add('card-descripcion');

    // Precio formateado como $59.000
    const precio = document.createElement('span');
    precio.textContent = formatearPrecio(tarjeta.precio);
    precio.classList.add('card-precio');

    // Etiqueta de medida (debajo del precio)
    const medida = document.createElement('span');
    medida.textContent = tarjeta.medida || '';
    medida.classList.add('card-medida');

    // Etiqueta de popular (si aplica)
    if (tarjeta.popular) {
      const badge = document.createElement('span');
      badge.textContent = 'POPULAR';
      badge.classList.add('card-badge');
      card.appendChild(badge);
    }

    const boton = document.createElement('button');
    boton.textContent = 'Agregar al carrito';
    boton.classList.add('card-boton');

    //Verificar si ya está en el carrito (al recargar la página)
    if (existeProducto(tarjeta.id)) {
      boton.textContent = 'Agregado';
      boton.classList.add('agregado');
      boton.disabled = true;
    }

    // Interacción del botón
    boton.addEventListener('click', (e) => {
      e.stopPropagation();
      agregarProducto(tarjeta);

      // Cambiar apariencia del botón
      boton.textContent = 'Agregado';
      boton.classList.add('agregado');
      boton.disabled = true;
    });

    // Interacción de la tarjeta completa
    card.addEventListener('click', () => {
      mostrarDetalle(tarjeta);
    });

    card.appendChild(img);
    card.appendChild(titulo);
    card.appendChild(descripcion);
    card.appendChild(precio);
    card.appendChild(medida);
    card.appendChild(boton);
    contenedor.appendChild(card);
  });
}

// Formatear precio a pesos colombianos
function formatearPrecio(valor) {
  if (!valor) return '';
  return '$' + valor.toLocaleString('es-CO'); // Ej: $59.000
}

function mostrarDetalle(producto) {
  const nombre = producto.titulo || producto.nombre;
  const desc = producto.descripcion || '';
  const precioFormateado = formatearPrecio(producto.precio);
  //alert(`Detalle: ${nombre}\n${desc}\nPrecio: ${precioFormateado}\nMedida: ${producto.medida}`);
}

// COMPLEMENTO PARA LA BUSQUEDA DE Levenshtein
export function inicializarBuscador(listaTarjetas) {
  const input = document.getElementById('buscador');
  if (!input) return;
  
  const filtroGuardado = localStorage.getItem("filtro_barrilete") || localStorage.getItem("filtro_pendiente_barrilete");

    if (filtroGuardado) {
    input.value = filtroGuardado;
    localStorage.removeItem("filtro_barrilete");
    localStorage.removeItem("filtro_pendiente_barrilete");
        
    const umbral = 0.8;
    const filtradas = filtrarPorSimilitud(listaTarjetas, filtroGuardado, umbral);
    renderizarTarjetas(filtradas);
  }
    
  input.addEventListener('input', () => {
    const texto = input.value.trim().toLowerCase();
    if (texto === '') {
      renderizarTarjetas(listaTarjetas);
      return;
    }

    const umbral = 0.8;
    const filtradas = filtrarPorSimilitud(listaTarjetas, texto, umbral);
    renderizarTarjetas(filtradas);
  });
}
