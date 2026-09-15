const STORAGE_KEY = 'carrito_barrilete';
let carrito = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

function guardarEnStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito));
}

export function agregarProducto(producto) {
    const existe = carrito.some(item => item.id === producto.id);
    if (!existe) {
        carrito.push({ ...producto, cantidad: 1 });
        guardarEnStorage();
    }
}

export function incrementarCantidad(id) {
    const item = carrito.find(item => item.id === id);
    if (item) {
        item.cantidad += 1;
        guardarEnStorage();
    }
}

export function decrementarCantidad(id) {
    const item = carrito.find(item => item.id === id);
    if (item && item.cantidad > 1) {
        item.cantidad -= 1;
        guardarEnStorage();
    } else if (item && item.cantidad === 1) {
        carrito = carrito.filter(item => item.id !== id);
        guardarEnStorage();
    }
}

export function eliminarProducto(id) {
    carrito = carrito.filter(item => item.id !== id);
    guardarEnStorage();
}

export function obtenerCarrito() {
    return carrito;
}

export function vaciarCarrito() {
    carrito = [];
    guardarEnStorage();
}

export function existeProducto(id) {
    return carrito.some(item => item.id === id);
}