import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorApp } from './errores.js';
import { cargarUsuario } from './http/middleware.js';
import { crearRutas } from './http/rutas.js';
import { AuditoriaServicio } from './servicios/AuditoriaServicio.js';
import { AuthServicio } from './servicios/AuthServicio.js';
import { JornadaServicio } from './servicios/JornadaServicio.js';
import { NotificacionServicio } from './servicios/NotificacionServicio.js';
import { PedidoServicio } from './servicios/PedidoServicio.js';
import { FacturaServicio } from './servicios/FacturaServicio.js';
import { FavoritosServicio } from './servicios/FavoritosServicio.js';
import { PromocionServicio } from './servicios/PromocionServicio.js';
import { PermisoServicio } from './servicios/PermisoServicio.js';
import { ProductoServicio } from './servicios/ProductoServicio.js';
import { ResumenServicio } from './servicios/ResumenServicio.js';
import { TurnoServicio } from './servicios/TurnoServicio.js';
import { UsuarioServicio } from './servicios/UsuarioServicio.js';
import { VendedorServicio } from './servicios/VendedorServicio.js';
import { VentaTiendaServicio } from './servicios/VentaTiendaServicio.js';

/** Carpetas del frontend que se publican. Nada más: ni server/, ni data/, ni package.json. */
const CARPETAS_PUBLICAS = ['css', 'js', 'img', 'json', 'favicon'];

function montarFrontend(app, raiz) {
    for (const carpeta of CARPETAS_PUBLICAS) {
        app.use(`/${carpeta}`, express.static(path.join(raiz, carpeta)));
    }
    app.get('/main.js', (req, res) => res.sendFile(path.join(raiz, 'main.js')));

    const paginas = fs.readdirSync(raiz).filter(archivo => archivo.endsWith('.html'));
    for (const pagina of paginas) {
        const rutas = pagina === 'index.html' ? ['/', '/index.html'] : [`/${pagina}`];
        for (const ruta of rutas) app.get(ruta, (req, res) => res.sendFile(path.join(raiz, pagina)));
    }
}

function manejadorErrores(err, req, res, next) {
    if (err instanceof ErrorApp) {
        return res.status(err.status).json({ error: err.message, detalles: err.detalles });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
}

/** Ensambla la aplicación. Las dependencias se reciben, no se crean aquí (inyección). */
export function crearApp({ db, config }) {
    const auditoria = new AuditoriaServicio({ db });
    const notificaciones = new NotificacionServicio({ db });
    const permisos = new PermisoServicio({ db, notificaciones, auditoria });
    const jornadas = new JornadaServicio({ db, auditoria, notificaciones });
    const turnos = new TurnoServicio({ db, notificaciones, auditoria });
    const productos = new ProductoServicio({ db, auditoria, raiz: config.RAIZ });
    const promociones = new PromocionServicio({ db, auditoria });
    const facturas = new FacturaServicio({ db, auditoria, empresa: config.EMPRESA });
    const pedidos = new PedidoServicio({ db, auditoria, facturas, empresa: config.EMPRESA, notificaciones, jornadas });
    const servicios = {
        auth: new AuthServicio({ db, auditoria, sesionHoras: config.SESION_HORAS }),
        productos,
        pedidos,
        usuarios: new UsuarioServicio({ db, auditoria, notificaciones, adminPrincipal: config.ADMIN_EMAIL }),
        resumen: new ResumenServicio({ db }),
        auditoria,
        notificaciones,
        permisos,
        jornadas,
        turnos,
        promociones,
        facturas,
        favoritos: new FavoritosServicio({ db }),
        ventaTienda: new VentaTiendaServicio({ db, pedidos, jornadas, facturas, auditoria }),
        vendedor: new VendedorServicio({ db, jornadas, turnos, permisos, notificaciones, productos })
    };

    const app = express();
    app.disable('x-powered-by');
    if (config.PRODUCCION) app.set('trust proxy', 1);

    app.use(express.json({ limit: '100kb' }));
    app.use(cargarUsuario(servicios.auth));
    app.use('/api', crearRutas(servicios, config));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

    montarFrontend(app, config.RAIZ);
    app.use(manejadorErrores);
    return app;
}
