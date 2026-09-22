import { renderizarProducto, inicializarMenuHamburguesa, renderizarTarjetas, inicializarBuscador } from './js/ui.js';
import { inicializarCarrito } from './js/carritoUI.js';
import { inicializarSesion, inicializarLogin, inicializarRegistro } from './js/user.js';

let listaProductos = [];
let currentIndex = 0;

async function cargarTarjetas() {
    try {
        const res = await fetch('./json/tarjetas.json');
        const tarjetas = await res.json();
        renderizarTarjetas(tarjetas);
        inicializarBuscador(tarjetas);
    } catch (error) {
        console.error('Error al cargar tarjetas:', error);
    }
}

async function iniciarApp() {
    try {
        const res = await fetch('./json/productos.json');
        listaProductos = await res.json();
        
        setInterval(() => {
            currentIndex = (currentIndex + 1) % listaProductos.length;
            renderizarProducto(listaProductos[currentIndex], currentIndex);
        }, 5000);

    } catch (err) {
        console.error("Fallo al cargar JSON", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarSesion();
    inicializarLogin();
    inicializarRegistro();
    iniciarApp();
    inicializarMenuHamburguesa();
    cargarTarjetas();

    if (document.getElementById('carrito-items')) {
        inicializarCarrito();
    }

    const btnAccion = document.getElementById("btn-accion");
    if (btnAccion) {
        btnAccion.addEventListener("click", () => {
            const sessionData = localStorage.getItem("session_barrilete");
            let isLoggedIn = false;
            if (sessionData) {
                try {
                    const parsed = JSON.parse(sessionData);
                    isLoggedIn = parsed.isLoggedIn === true;
                } catch (e) { isLoggedIn = false; }
            }

            let tituloSucio = "";
            const h1Principal = document.getElementById("titulo-principal");
            
            if (listaProductos && listaProductos[currentIndex]) {
                tituloSucio = listaProductos[currentIndex].titulo || "";
            } else if (h1Principal) {
                tituloSucio = h1Principal.innerHTML;
            }

            let productoActual = tituloSucio
                .replace(/<[^>]*>/g, " ")
                .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g, "")
                .trim()
                .split(" ")[0]
                .toLowerCase();

            if (isLoggedIn) {
                if (productoActual) localStorage.setItem("filtro_barrilete", productoActual);
                window.location.href = "index_productos.html";
            } else {
                if (productoActual) localStorage.setItem("filtro_pendiente_barrilete", productoActual);
                window.location.href = "index_login.html";
            }
        });
    }
});
