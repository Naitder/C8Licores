/**
 * Migraciones versionadas. Nunca se editan migraciones ya aplicadas: para
 * cambiar el esquema se agrega una nueva versión al final de la lista.
 */
export const MIGRACIONES = [
    {
        version: 1,
        nombre: 'esquema_inicial',
        sql: `
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'vendedor', 'cliente')),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    debe_cambiar_password INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar_password IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_en TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE productos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    imagen TEXT NOT NULL DEFAULT '',
    precio INTEGER NOT NULL CHECK (precio >= 0),
    precio_promocional INTEGER
        CHECK (precio_promocional IS NULL OR (precio_promocional >= 0 AND precio_promocional < precio)),
    medida TEXT NOT NULL DEFAULT '',
    categoria TEXT NOT NULL DEFAULT 'Sin clasificar',
    popular INTEGER NOT NULL DEFAULT 0 CHECK (popular IN (0, 1)),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    estado TEXT NOT NULL DEFAULT 'agotado' CHECK (estado IN ('disponible', 'agotado', 'inactivo')),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    total INTEGER NOT NULL CHECK (total >= 0),
    estado TEXT NOT NULL DEFAULT 'pendiente_pago'
        CHECK (estado IN ('pendiente_pago', 'completado', 'cancelado')),
    metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('contra_entrega', 'manual')),
    direccion_entrega TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    nombre_producto TEXT NOT NULL,
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    accion TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id TEXT,
    detalle TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id);
`
    },
    {
        // Turnos, asistencia, permisos de vendedores, notificaciones y ventas de tienda.
        version: 2,
        nombre: 'turnos_vendedores_tienda',
        sql: `
CREATE TABLE turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    hora_inicio TEXT NOT NULL CHECK (hora_inicio GLOB '[0-2][0-9]:[0-5][0-9]'),
    hora_fin TEXT NOT NULL CHECK (hora_fin GLOB '[0-2][0-9]:[0-5][0-9]'),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE asignaciones_turno (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    turno_id INTEGER NOT NULL REFERENCES turnos(id),
    fecha TEXT NOT NULL CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    creado_por INTEGER REFERENCES usuarios(id),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (usuario_id, fecha)
);

CREATE TABLE jornadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    turno_id INTEGER REFERENCES turnos(id),
    fecha TEXT NOT NULL,
    entrada_en TEXT NOT NULL,
    salida_en TEXT
);

CREATE TABLE permisos_usuario (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    permiso TEXT NOT NULL CHECK (permiso IN ('editar_stock', 'editar_precios', 'gestionar_promociones', 'editar_productos')),
    PRIMARY KEY (usuario_id, permiso)
);

CREATE TABLE notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE pedidos ADD COLUMN origen TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'tienda'));
ALTER TABLE pedidos ADD COLUMN vendedor_id INTEGER REFERENCES usuarios(id);
ALTER TABLE pedidos ADD COLUMN turno_id INTEGER REFERENCES turnos(id);
ALTER TABLE pedidos ADD COLUMN forma_pago TEXT CHECK (forma_pago IN ('efectivo', 'tarjeta', 'transferencia'));
ALTER TABLE pedidos ADD COLUMN pago_recibido INTEGER;
ALTER TABLE pedidos ADD COLUMN cambio INTEGER;

CREATE INDEX idx_asignaciones_fecha ON asignaciones_turno(fecha);
CREATE INDEX idx_jornadas_usuario ON jornadas(usuario_id, fecha);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id, leida);
`
    },
    {
        // Promociones (descuento %, descuento por monto, NxM), descuentos en líneas
        // de pedido y facturas estándar. Los precios promocionales antiguos pasan a
        // promociones de tipo monto; la columna productos.precio_promocional queda sin uso.
        version: 3,
        nombre: 'promociones_facturas',
        sql: `
CREATE TABLE promociones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto', 'nxm')),
    valor INTEGER,
    lleva INTEGER,
    paga INTEGER,
    activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (tipo = 'porcentaje' AND valor BETWEEN 1 AND 99 AND lleva IS NULL AND paga IS NULL)
        OR (tipo = 'monto' AND valor > 0 AND lleva IS NULL AND paga IS NULL)
        OR (tipo = 'nxm' AND valor IS NULL AND lleva > paga AND paga > 0)
    )
);

-- Un producto solo puede tener una promoción activa a la vez.
CREATE UNIQUE INDEX ux_promociones_activa ON promociones(producto_id) WHERE activa = 1;

INSERT INTO promociones (producto_id, nombre, tipo, valor, activa)
    SELECT id, 'Precio especial', 'monto', precio - precio_promocional, 1
    FROM productos WHERE precio_promocional IS NOT NULL;
UPDATE productos SET precio_promocional = NULL WHERE precio_promocional IS NOT NULL;

ALTER TABLE pedido_items ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0);
ALTER TABLE pedido_items ADD COLUMN promocion TEXT;

CREATE TABLE facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
    cliente_nombre TEXT NOT NULL,
    cliente_identificacion TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
`
    },
    {
        version: 4,
        nombre: 'iva_y_transferencia_web',
        // SQLite no puede cambiar un CHECK existente: se reconstruye la tabla pedidos
        // (procedimiento oficial de 12 pasos). Las claves foráneas se desactivan en migrar().
        sql: `
CREATE TABLE pedidos_nueva (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    total INTEGER NOT NULL CHECK (total >= 0),
    iva INTEGER NOT NULL DEFAULT 0 CHECK (iva >= 0),
    estado TEXT NOT NULL DEFAULT 'pendiente_pago'
        CHECK (estado IN ('pendiente_pago', 'completado', 'cancelado')),
    metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('contra_entrega', 'manual', 'transferencia')),
    direccion_entrega TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
    origen TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'tienda')),
    vendedor_id INTEGER REFERENCES usuarios(id),
    turno_id INTEGER REFERENCES turnos(id),
    forma_pago TEXT CHECK (forma_pago IN ('efectivo', 'tarjeta', 'transferencia')),
    pago_recibido INTEGER,
    cambio INTEGER
);

INSERT INTO pedidos_nueva (id, usuario_id, total, estado, metodo_pago, direccion_entrega,
    creado_en, actualizado_en, origen, vendedor_id, turno_id, forma_pago, pago_recibido, cambio)
SELECT id, usuario_id, total, estado, metodo_pago, direccion_entrega,
    creado_en, actualizado_en, origen, vendedor_id, turno_id, forma_pago, pago_recibido, cambio
FROM pedidos;

DROP TABLE pedidos;
ALTER TABLE pedidos_nueva RENAME TO pedidos;
CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
`
    },
    {
        version: 5,
        nombre: 'verificacion_edad_y_facturas_internas',
        sql: `
ALTER TABLE pedidos ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE pedidos ADD COLUMN cedula_verificada TEXT;
ALTER TABLE facturas ADD COLUMN pedida_por_cliente INTEGER NOT NULL DEFAULT 0 CHECK (pedida_por_cliente IN (0, 1));
`
    },
    {
        version: 6,
        nombre: 'datos_de_verificacion_en_usuarios',
        sql: `
ALTER TABLE usuarios ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE usuarios ADD COLUMN identificacion TEXT;
`
    },
    {
        version: 7,
        nombre: 'perfil_telefono_y_guardados',
        sql: `
ALTER TABLE usuarios ADD COLUMN telefono TEXT;
CREATE TABLE favoritos (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (usuario_id, producto_id)
);
`
    },
    {
        version: 8,
        nombre: 'historial_sin_producto',
        // Un producto eliminado no borra sus pedidos: el ítem conserva nombre y precio
        // y solo pierde el enlace al producto (producto_id queda vacío).
        sql: `
CREATE TABLE pedido_items_nueva (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    nombre_producto TEXT NOT NULL,
    precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    promocion TEXT
);

INSERT INTO pedido_items_nueva (id, pedido_id, producto_id, nombre_producto, precio_unitario,
    cantidad, subtotal, descuento, promocion)
SELECT id, pedido_id, producto_id, nombre_producto, precio_unitario,
    cantidad, subtotal, descuento, promocion
FROM pedido_items;

DROP TABLE pedido_items;
ALTER TABLE pedido_items_nueva RENAME TO pedido_items;
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);
`
    }
];

/** Aplica, en orden y dentro de una transacción, las migraciones pendientes. */
export function migrar(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    const aplicadas = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(f => f.version));

    // Las claves foráneas solo se pueden desactivar fuera de una transacción.
    const fkPrevio = Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys) === 1;
    db.exec('PRAGMA foreign_keys = OFF');
    try {
        for (const migracion of MIGRACIONES) {
            if (aplicadas.has(migracion.version)) continue;
            db.exec('BEGIN');
            try {
                db.exec(migracion.sql);
                db.prepare('INSERT INTO schema_migrations (version, nombre) VALUES (?, ?)')
                    .run(migracion.version, migracion.nombre);
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
            const rotas = db.prepare('PRAGMA foreign_key_check').all();
            if (rotas.length) {
                throw new Error(`La migración ${migracion.version} dejó referencias rotas: ${JSON.stringify(rotas)}`);
            }
        }
    } finally {
        db.exec(`PRAGMA foreign_keys = ${fkPrevio ? 'ON' : 'OFF'}`);
    }
}
