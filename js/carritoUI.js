import { obtenerCarrito, incrementarCantidad, decrementarCantidad, eliminarProducto } from './carrito.js';

const formatearPrecio = (valor) => {
    if (!valor) return '';
    return '$' + valor.toLocaleString('es-CO');
};

function crearItemCarrito(producto) {
    const item = document.createElement('div');
    item.className = 'carrito-item';

    const img = document.createElement('img');
    img.src = producto.imagen;
    img.alt = producto.titulo || producto.nombre;
    img.className = 'carrito-item-img';

    const info = document.createElement('div');
    info.className = 'carrito-item-info';

    const titulo = document.createElement('h3');
    titulo.textContent = producto.titulo || producto.nombre;
    titulo.className = 'carrito-item-titulo';

    const descripcion = document.createElement('p');
    descripcion.textContent = producto.descripcion || '';
    descripcion.className = 'carrito-item-descripcion';

    const medida = document.createElement('span');
    medida.textContent = producto.medida || '';
    medida.className = 'carrito-item-medida';

    info.appendChild(titulo);
    if (producto.descripcion) info.appendChild(descripcion);
    info.appendChild(medida);

    const precioUnitario = document.createElement('span');
    precioUnitario.textContent = formatearPrecio(producto.precio);
    precioUnitario.className = 'carrito-item-precio-unitario';

    const cantidadControl = document.createElement('div');
    cantidadControl.className = 'carrito-item-cantidad';

    const btnMenos = document.createElement('button');
    btnMenos.textContent = '−';
    btnMenos.className = 'btn-cantidad';

    const cantidadSpan = document.createElement('span');
    cantidadSpan.textContent = producto.cantidad;
    cantidadSpan.className = 'cantidad-numero';

    const btnMas = document.createElement('button');
    btnMas.textContent = '+';
    btnMas.className = 'btn-cantidad';

    btnMenos.addEventListener('click', () => {
        decrementarCantidad(producto.id);
        actualizarVistaCarrito();
    });

    btnMas.addEventListener('click', () => {
        incrementarCantidad(producto.id);
        actualizarVistaCarrito();
    });

    cantidadControl.appendChild(btnMenos);
    cantidadControl.appendChild(cantidadSpan);
    cantidadControl.appendChild(btnMas);

    const subtotal = document.createElement('span');
    subtotal.textContent = formatearPrecio(producto.precio * producto.cantidad);
    subtotal.className = 'carrito-item-subtotal';

    const btnEliminar = document.createElement('button');
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.className = 'btn-eliminar';
    btnEliminar.addEventListener('click', () => {
        eliminarProducto(producto.id);
        actualizarVistaCarrito();
    });

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(precioUnitario);
    item.appendChild(cantidadControl);
    item.appendChild(subtotal);
    item.appendChild(btnEliminar);

    return item;
}

function actualizarVistaCarrito() {
    const contenedor = document.getElementById('carrito-items');
    const totalSpan = document.getElementById('carrito-total');
    if (!contenedor || !totalSpan) return;

    const carrito = obtenerCarrito();
    contenedor.innerHTML = '';

    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
        totalSpan.textContent = '$0';
        return;
    }

    let total = 0;
    carrito.forEach(producto => {
        contenedor.appendChild(crearItemCarrito(producto));
        total += producto.precio * producto.cantidad;
    });

    totalSpan.textContent = formatearPrecio(total);
}

export function inicializarCarrito() {
    const contenedor = document.getElementById('carrito-items');
    if (!contenedor) return;
    actualizarVistaCarrito();
}