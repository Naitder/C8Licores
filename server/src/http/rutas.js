import express from 'express';
import { ErrorApp } from '../errores.js';
import { PERMISOS } from '../servicios/PermisoServicio.js';
import { NOMBRE_COOKIE, requerirRol, requerirSesion } from './middleware.js';

/** Convierte un parámetro de ruta en entero positivo, o responde 400. */
function idParam(valor) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) throw new ErrorApp(400, 'Identificador no válido.');
    return n;
}

export function crearRutas({
    auth, productos, pedidos, usuarios, auditoria, resumen,
    notificaciones, permisos, jornadas, turnos, ventaTienda, vendedor, promociones, facturas, favoritos
}, config) {
    const r = express.Router();
    const soloSuperadmin = requerirRol('superadmin');
    const soloVendedor = requerirRol('vendedor');
    const vendedorOAdmin = requerirRol('vendedor', 'superadmin');
    const exigirGestionPromociones = (req, res, next) => {
        if (permisos.tiene(req.usuario, 'gestionar_promociones')) return next();
        next(new ErrorApp(403, 'No tienes permiso para gestionar promociones.'));
    };

    const cookieSesion = (token, maxAgeSegundos) =>
        `${NOMBRE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSegundos}`
        + (config.PRODUCCION ? '; Secure' : '');

    // ---- Autenticación ----
    r.post('/auth/registro', (req, res) => {
        const { token, usuario } = auth.registrar(req.body ?? {});
        res.setHeader('Set-Cookie', cookieSesion(token, config.SESION_HORAS * 3600));
        res.status(201).json({ usuario });
    });

    r.get('/auth/perfil', requerirSesion, (req, res) => {
        res.json({ perfil: auth.perfil(req.usuario) });
    });

    r.put('/auth/perfil', requerirSesion, (req, res) => {
        res.json({ perfil: auth.actualizarPerfil(req.usuario, req.body ?? {}) });
    });

    r.post('/auth/login', (req, res) => {
        const { token, usuario } = auth.iniciarSesion(req.body?.identificador, req.body?.password);
        res.setHeader('Set-Cookie', cookieSesion(token, config.SESION_HORAS * 3600));
        pedidos.avisarPendientesA(usuario);
        res.json({ usuario });
    });

    r.post('/auth/logout', (req, res) => {
        if (req.usuario) auth.cerrarSesion(req.tokenSesion, req.usuario);
        res.setHeader('Set-Cookie', cookieSesion('', 0));
        res.json({ ok: true });
    });

    r.get('/auth/me', (req, res) => {
        if (!req.usuario) throw new ErrorApp(401, 'No hay sesión activa.');
        res.json({ usuario: req.usuario });
    });

    r.post('/auth/cambiar-password', requerirSesion, (req, res) => {
        auth.cambiarPassword(req.usuario, req.body?.actual, req.body?.nueva);
        res.json({ ok: true });
    });

    // ---- Catálogo público ----
    r.get('/productos', (req, res) => {
        res.json({ productos: productos.listarPublicos() });
    });

    r.get('/productos/:id', (req, res) => {
        res.json({ producto: productos.obtener(idParam(req.params.id)) });
    });

    // ---- Pedidos (cualquier usuario con sesión) ----
    r.post('/pedidos', requerirSesion, (req, res) => {
        res.status(201).json({ pedido: pedidos.crear(req.usuario, req.body ?? {}) });
    });

    r.get('/pedidos', requerirSesion, (req, res) => {
        res.json({ pedidos: pedidos.listar(req.usuario) });
    });

    r.get('/pedidos/mios', requerirSesion, (req, res) => {
        res.json({ pedidos: pedidos.listarMios(req.usuario) });
    });

    // ---- Guardados (productos que la persona marca para después) ----
    r.get('/favoritos', requerirSesion, (req, res) => {
        res.json({ favoritos: favoritos.listar(req.usuario) });
    });

    r.post('/favoritos', requerirSesion, (req, res) => {
        favoritos.guardar(req.usuario, idParam(req.body?.productoId));
        res.status(201).json({ ok: true });
    });

    r.delete('/favoritos/:productoId', requerirSesion, (req, res) => {
        favoritos.quitar(req.usuario, idParam(req.params.productoId));
        res.json({ ok: true });
    });

    r.get('/pedidos/:id', requerirSesion, (req, res) => {
        res.json({ pedido: pedidos.obtener(idParam(req.params.id), req.usuario) });
    });

    // ---- Administración (solo superadministrador) ----
    r.get('/admin/resumen', soloSuperadmin, (req, res) => {
        res.json({ resumen: resumen.obtener() });
    });

    r.get('/admin/productos', soloSuperadmin, (req, res) => {
        res.json({ productos: productos.listarTodos() });
    });

    r.post('/admin/productos', soloSuperadmin, (req, res) => {
        res.status(201).json({ producto: productos.crear(req.body ?? {}, req.usuario) });
    });

    r.put('/admin/productos/:id', soloSuperadmin, (req, res) => {
        res.json({ producto: productos.actualizar(idParam(req.params.id), req.body ?? {}, req.usuario) });
    });

    // Foto subida desde el computador: el cuerpo es la imagen misma (sin JSON), hasta 3 MB.
    r.post('/admin/productos/:id/imagen', soloSuperadmin,
        express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '3mb' }), (req, res) => {
            res.json({ producto: productos.guardarImagen(idParam(req.params.id), req.body, req.get('content-type'), req.usuario) });
        });

    r.delete('/admin/productos/:id', soloSuperadmin, (req, res) => {
        productos.eliminar(idParam(req.params.id), req.usuario);
        res.json({ ok: true });
    });

    r.patch('/admin/pedidos/:id/estado', soloSuperadmin, (req, res) => {
        res.json({ pedido: pedidos.cambiarEstado(idParam(req.params.id), req.body?.estado, req.usuario) });
    });

    r.get('/admin/usuarios', soloSuperadmin, (req, res) => {
        res.json({ usuarios: usuarios.listar() });
    });

    r.patch('/admin/usuarios/:id', soloSuperadmin, (req, res) => {
        res.json({ usuario: usuarios.actualizar(idParam(req.params.id), req.body ?? {}, req.usuario) });
    });

    r.get('/admin/auditoria', soloSuperadmin, (req, res) => {
        res.json({ registros: auditoria.listar() });
    });

    // ---- Turnos y asignaciones (superadministrador) ----
    r.get('/admin/turnos', soloSuperadmin, (req, res) => {
        res.json({ turnos: turnos.listar() });
    });

    r.post('/admin/turnos', soloSuperadmin, (req, res) => {
        res.status(201).json({ turno: turnos.crear(req.body ?? {}, req.usuario) });
    });

    r.put('/admin/turnos/:id', soloSuperadmin, (req, res) => {
        res.json({ turno: turnos.actualizar(idParam(req.params.id), req.body ?? {}, req.usuario) });
    });

    r.get('/admin/asignaciones', soloSuperadmin, (req, res) => {
        res.json({ asignaciones: turnos.listarAsignaciones({ desde: req.query.desde, hasta: req.query.hasta }) });
    });

    r.post('/admin/asignaciones', soloSuperadmin, (req, res) => {
        res.status(201).json({ asignacion: turnos.asignar(req.body ?? {}, req.usuario) });
    });

    r.delete('/admin/asignaciones/:id', soloSuperadmin, (req, res) => {
        turnos.quitarAsignacion(idParam(req.params.id), req.usuario);
        res.json({ ok: true });
    });

    // ---- Vendedores y permisos (superadministrador) ----
    r.get('/admin/vendedores', soloSuperadmin, (req, res) => {
        res.json({ vendedores: permisos.listarVendedores(), catalogo: PERMISOS });
    });

    r.put('/admin/vendedores/:id/permisos', soloSuperadmin, (req, res) => {
        const concedidos = permisos.establecer(idParam(req.params.id), req.body?.permisos, req.usuario);
        res.json({ permisos: concedidos });
    });

    r.get('/admin/jornadas', soloSuperadmin, (req, res) => {
        res.json({ jornadas: jornadas.listarPorFecha(req.query.fecha) });
    });

    // ---- Notificaciones (cualquier usuario con sesión) ----
    r.get('/notificaciones', requerirSesion, (req, res) => {
        res.json({
            notificaciones: notificaciones.listarPara(req.usuario.id),
            noLeidas: notificaciones.noLeidas(req.usuario.id)
        });
    });

    r.post('/notificaciones/:id/leer', requerirSesion, (req, res) => {
        notificaciones.marcarLeida(req.usuario.id, idParam(req.params.id));
        res.json({ ok: true });
    });

    // ---- Módulo de vendedor (vendedor; el superadministrador puede vender y consultar) ----
    r.get('/vendedor/panel', vendedorOAdmin, (req, res) => {
        res.json({ panel: vendedor.panel(req.usuario) });
    });

    r.post('/vendedor/jornada/entrada', soloVendedor, (req, res) => {
        res.json({ jornadaActiva: jornadas.entrada(req.usuario) });
    });

    r.post('/vendedor/jornada/salida', soloVendedor, (req, res) => {
        jornadas.salida(req.usuario);
        res.json({ jornadaActiva: null });
    });

    // Pedidos web: el vendedor en turno ve los pendientes, toma uno y lo completa o cancela.
    r.get('/vendedor/pedidos', vendedorOAdmin, (req, res) => {
        res.json({ pedidos: pedidos.listarDelTurno(req.usuario) });
    });

    r.get('/vendedor/pedidos-web', vendedorOAdmin, (req, res) => {
        res.json(pedidos.listarWebVendedor(req.usuario));
    });

    r.post('/vendedor/pedidos/:id/atender', vendedorOAdmin, (req, res) => {
        res.json({ pedido: pedidos.atender(idParam(req.params.id), req.usuario) });
    });

    r.patch('/vendedor/pedidos/:id/estado', vendedorOAdmin, (req, res) => {
        res.json({ pedido: pedidos.cambiarEstadoVendedor(idParam(req.params.id), req.body?.estado, req.usuario) });
    });

    r.get('/vendedor/ventas', vendedorOAdmin, (req, res) => {
        res.json({ ventas: pedidos.listarVentasTienda(req.usuario) });
    });

    r.post('/vendedor/ventas', vendedorOAdmin, (req, res) => {
        res.status(201).json({ venta: ventaTienda.crear(req.usuario, req.body ?? {}) });
    });

    r.get('/vendedor/productos', vendedorOAdmin, (req, res) => {
        res.json({ productos: productos.listarTodos() });
    });

    r.patch('/vendedor/productos/:id', vendedorOAdmin, (req, res) => {
        res.json({ producto: vendedor.actualizarProducto(req.usuario, idParam(req.params.id), req.body ?? {}) });
    });

    // ---- Cotización de carrito (pública: la tienda muestra el total con promociones) ----
    r.post('/pedidos/cotizacion', (req, res) => {
        res.json({ cotizacion: pedidos.cotizar(req.body?.items) });
    });

    // ---- Facturas guardadas (superadministrador: todas o las propias; vendedor: las de hoy) ----
    r.get('/facturas', vendedorOAdmin, (req, res) => {
        res.json(facturas.listar(req.usuario, req.query.alcance ?? 'todas', req.query.turno ?? null));
    });

    // ---- Factura estándar (comprador, vendedor que vendió, o superadministrador) ----
    r.post('/pedidos/:id/factura', requerirSesion, (req, res) => {
        res.status(201).json(facturas.solicitar(idParam(req.params.id), req.body ?? {}, req.usuario));
    });

    r.get('/pedidos/:id/factura', requerirSesion, async (req, res, next) => {
        try {
            const { numero, buffer } = await facturas.pdf(idParam(req.params.id), req.usuario);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${numero}.pdf"`);
            res.send(buffer);
        } catch (error) {
            next(error);
        }
    });

    // ---- Promociones: ver (vendedor y superadministrador); cambiar (con el permiso gestionar_promociones) ----
    r.get('/promociones', vendedorOAdmin, (req, res) => {
        res.json({ promociones: promociones.listar() });
    });

    r.post('/promociones', vendedorOAdmin, exigirGestionPromociones, (req, res) => {
        res.status(201).json({ promocion: promociones.crear(req.body ?? {}, req.usuario) });
    });

    r.put('/promociones/:id', vendedorOAdmin, exigirGestionPromociones, (req, res) => {
        res.json({ promocion: promociones.actualizar(idParam(req.params.id), req.body ?? {}, req.usuario) });
    });

    r.delete('/promociones/:id', vendedorOAdmin, exigirGestionPromociones, (req, res) => {
        promociones.eliminar(idParam(req.params.id), req.usuario);
        res.json({ ok: true });
    });

    return r;
}
