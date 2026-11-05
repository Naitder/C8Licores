# C8LICORES — Servidor, base de datos y API

Desarrollado por Cristiam Andrés Escobar Cerón

Este documento describe la capa de servidor, la base de datos, la API y los módulos
de administración y vendedor de C8LICORES.

## 1. Requisitos

- Node.js 22.13 o superior (usa el módulo `node:sqlite` integrado; no requiere compilar nada).

## 2. Ejecutar

```bash
npm install
npm test          # 41 pruebas: lógica del frontend, API, turnos y ventas en tienda
npm start         # http://localhost:3000
```

Variables de entorno (todas opcionales):

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DB_PATH` | `data/c8licores.db` | Archivo SQLite |
| `NODE_ENV` | — | `production` activa cookies `Secure` y advertencias de seguridad |
| `ADMIN_EMAIL` | `admin@universidad.com` | Correo del superadministrador inicial |
| `ADMIN_PASSWORD` | `Admin1234*` | Contraseña inicial (se fuerza cambio al primer ingreso) |
| `SEED_STOCK_INICIAL` | `0` | Existencias con las que se crean los productos del JSON |
| `EMPRESA_NOMBRE` | `C8LICORES` | Nombre que aparece en las facturas |
| `EMPRESA_NIT` | — | NIT que aparece en las facturas (vacío = no se muestra) |
| `EMPRESA_DIRECCION` | — | Dirección que aparece en las facturas (vacío = no se muestra) |
| `EMPRESA_CUENTA_TRANSFERENCIA` | — | Cuenta bancaria que se muestra al pagar por transferencia |

## 3. Base de datos

Archivo único: `data/c8licores.db` (se crea solo). Las migraciones están en
`server/src/db/migraciones.js` y se aplican en orden; la tabla `schema_migrations`
registra cuáles ya se ejecutaron. Los cambios de esquema se agregan como nuevas
versiones, nunca editando las existentes. Una base creada con la versión 1 se
actualiza sola a la 2 al iniciar, sin perder datos.

Tablas:

- `usuarios`: cuentas, rol (`superadmin`, `vendedor`, `cliente`), estado activo y contraseña en hash scrypt.
- `sesiones`: tokens guardados como hash SHA-256 con fecha de expiración.
- `productos`: artículos. Los campos coinciden con `json/tarjetas.json` (`id`, `titulo`/`nombre`, `descripcion`, `imagen`, `precio`, `medida`, `popular`) más `categoria`, `stock`, `precio_promocional` y `estado`.
- `pedidos` y `pedido_items`: compras y ventas. Cada línea guarda el nombre y precio del momento de la venta. Las ventas de tienda añaden `origen` (`web` / `tienda`), `vendedor_id`, `turno_id`, `forma_pago`, `pago_recibido` y `cambio`.
- `turnos`: turnos fijos (nombre, hora de inicio y fin, activo).
- `asignaciones_turno`: qué turno tiene cada vendedor en cada fecha (una por vendedor y día).
- `jornadas`: entradas y salidas que marca cada vendedor.
- `permisos_usuario`: permisos adicionales concedidos a un vendedor.
- `notificaciones`: avisos dentro de la aplicación, en el perfil de cada usuario.
- `auditoria`: registro de acciones administrativas con valores antes y después.

### Carga inicial (seed)

Al iniciar, `server/src/db/seed.js`:

1. Lee `json/tarjetas.json` e inserta cada artículo que no exista (por `id`).
   Un artículo ya existente **no se sobrescribe**, así los cambios hechos desde el panel se conservan.
2. Crea el superadministrador si no existe.
3. Crea los turnos iniciales si no existen: **Mañana** 08:00–14:00, **Tarde** 14:00–20:00 y **Noche** 20:00–23:00.
   El administrador puede cambiar sus horas o desactivarlos; no se sobrescriben.

Campos que el JSON no trae y cuyo valor es neutro: `stock` (según `SEED_STOCK_INICIAL`, por defecto 0)
y `categoria` («Sin clasificar»). Con stock 0 el producto aparece como **agotado** hasta que se
registre inventario desde el panel.

El campo `imagen` se guarda tal como está en el JSON (`img/Catalogo/...`). Los archivos se sirven
desde la carpeta del proyecto; no es necesario moverlos.

El archivo `json/productos.json` (las 3 diapositivas del slider) no se carga todavía: su estructura
es distinta (incluye HTML en el título) y se decidirá en la fase del módulo de catálogo.

## 4. Roles y permisos

| Acción | Cliente | Vendedor | Superadmin |
|---|---|---|---|
| Ver catálogo público | Sí | Sí | Sí |
| Registrarse / iniciar sesión | Sí | Sí | Sí |
| Comprar y ver sus pedidos | Sí | Solo sus ventas | Todos |
| Marcar entrada y salida de su turno | No | Sí | No |
| Ver su turno y próximos turnos | No | Sí | No |
| Vender en tienda (presencial) | No | Sí, con entrada abierta | Sí, sin turno |
| Ver productos | No | Sí | Sí |
| Editar productos | No | Solo los campos de sus permisos | Sí |
| Crear o eliminar productos | No | No | Sí |
| Turnos, asignaciones, permisos, jornadas, usuarios, auditoría, resumen | No | No | Sí |

Permisos que el superadministrador puede conceder a un vendedor, uno por uno (por defecto ninguno):

| Permiso | Qué permite |
|---|---|
| `editar_stock` | Ajustar existencias (recepción de mercancía) |
| `editar_precios` | Cambiar el precio regular |
| `gestionar_promociones` | Crear, cambiar o quitar el precio promocional |
| `editar_productos` | Mostrar u ocultar productos en la tienda (y editar sus datos generales) |

Los permisos se validan en el servidor (`server/src/http/rutas.js` y `server/src/servicios/VendedorServicio.js`).
El frontend no es una barrera. Un superadministrador no puede cambiar su propio rol ni suspender su cuenta,
y siempre debe quedar al menos uno activo.

**Administrador principal.** Es la cuenta cuyo correo coincide con `ADMIN_EMAIL` (la del arranque inicial).
Ningún otro superadministrador puede cambiarla (rol, estado, datos). Solo el principal puede asignar o quitar
el rol de superadministrador a otras cuentas; un superadministrador temporal no puede degradar ni reasignar
al principal ni convertir cuentas en superadministradores. Esas acciones devuelven 403.

Para convertir a alguien en vendedor, el superadministrador cambia su rol en **Usuarios**. Al pasar a
vendedor recibe un aviso en su perfil. Si luego deja de ser vendedor, pierde sus permisos y sus turnos futuros.

## 5. Compra web (checkout simulado)

`POST /api/pedidos` valida existencias, descuenta el stock y crea el pedido en estado
`pendiente_pago`, todo dentro de una transacción. El administrador lo cambia a `completado`
o `cancelado`. Cancelar devuelve las unidades al inventario. No hay integración con pasarelas de pago.

**Verificación de edad.** Como es un licor, el registro, la compra web y la venta en tienda exigen
fecha de nacimiento (`AAAA-MM-DD`) y cédula de 6 a 10 dígitos. Si la persona no tiene 18 años cumplidos
(según la fecha de hoy en Bogotá) se rechaza con 400 y `detalles.fechaNacimiento` (en el registro) o
`detalles.verificacionFecha` (en compra y venta). La cédula inválida devuelve `identificacion` o
`verificacionIdentificacion`.

- Al registrarse, los datos quedan guardados en la cuenta (`usuarios.fecha_nacimiento`, `usuarios.identificacion`).
- La compra web y la venta usan esos datos: el carrito y el formulario de factura los traen ya llenos.
- Cada compra web también guarda sus datos en el pedido (`pedidos.fecha_nacimiento`, `pedidos.cedula_verificada`).
- Una cuenta de cliente sin datos guardados (creada antes de esta versión) los guarda con su primera compra.
- La cédula no viaja en el usuario de la sesión: se consulta con `GET /api/auth/perfil`.
- La fecha de nacimiento y la cédula se registran una sola vez y después no cambian desde el perfil
  (las corrige el administrador). Nombre, correo y celular sí se pueden editar.

**Perfil** (`index_perfil.html` para clientes; «Mi perfil» en el panel del administrador y del vendedor):
información, pedidos realizados, guardados y facturas. Desde la tienda, PERFIL lleva al personal a esa
sección de su panel (`#perfil`).

**Aviso de pedidos web:** al registrar una compra web, el aviso llega solo a quienes tienen sesión abierta en
ese momento: superadministradores, y vendedores con jornada abierta hoy. Quien no está conectado no recibe el
aviso, pero el pedido queda en la cola. El aviso incluye el celular de contacto del cliente para coordinar la entrega.
Al iniciar sesión, un superadministrador o un vendedor en turno recibe la lista de pedidos que siguen pendientes,
y al marcar entrada el vendedor la recibe también (si son más de diez, indica cuántos más hay).

Métodos de pago en la compra web: `contra_entrega`, `transferencia` (se muestra la cuenta de
`EMPRESA_CUENTA_TRANSFERENCIA`) y `manual`. La compra puede llevar `factura: { nombre, identificacion }`
o pedirse después (ver 7.2).

El precio de cada línea lo calcula siempre el servidor con las promociones vigentes. La tienda
muestra el total antes de comprar con `POST /api/pedidos/cotizacion` (pública, no registra nada).

## 6. Turnos, asistencia y notificaciones

**Turnos.** El administrador crea o edita turnos (nombre, horario, activo). Un turno no se borra:
se desactiva. Cuando cambia el horario o se desactiva un turno, cada vendedor con ese turno en una
fecha futura recibe un aviso en su perfil.

**Asignaciones.** El administrador asigna un turno a un vendedor para una fecha (hoy o futura). Si ya
tenía uno ese día, se reemplaza. No se asignan turnos en fechas pasadas. Cada cambio notifica al vendedor.

**Consulta de asignaciones.** El panel muestra las asignaciones de un rango de fechas (por defecto, desde hace 7 días hasta dentro de 14). Las fechas pasadas solo se consultan: el servidor no permite quitar una asignación de una fecha anterior a hoy (409), para conservar el historial de turnos.

**Asistencia.** El vendedor marca **entrada** y **salida**:

- La entrada solo es posible si tiene un turno asignado para hoy y su turno está activo.
- No puede marcar dos entradas seguidas: primero debe marcar la salida.
- Sin entrada abierta no puede registrar ventas.

El administrador consulta las jornadas de cualquier fecha en la sección **Jornadas**.

**Pedidos web (cola).** El vendedor con entrada abierta, y el superadministrador en cualquier momento, ven en
«Pedidos web»:

- **Pendientes de atender:** pedidos web sin vendedor asignado. Al tomar uno (`POST /vendedor/pedidos/:id/atender`)
  queda a nombre de quien lo toma. Varias personas pueden estar en turno a la vez: quien toma primero se queda con
  el pedido, y los demás reciben 409 si intentan tomarlo. La factura y la venta quedan a nombre de quien lo atendió.
  El vendedor queda además en su turno; el superadministrador toma pedidos sin turno.
- **Atendidos:** el vendedor ve los atendidos en su turno de hoy (de cualquier compañero). El superadministrador
  ve los que él atendió. Solo quien lo tomó puede completarlo o cancelarlo (`PATCH /vendedor/pedidos/:id/estado`),
  y el superadministrador puede completar o cancelar cualquier pedido.

**Notificaciones.** Son avisos dentro de la aplicación, visibles en el inicio del vendedor, con contador de
no leídas. Se generan al asignar o quitar un turno, al cambiar un turno, al cambiar los permisos y al
convertir a alguien en vendedor. Quedan listas para enviarse también por correo cuando se configure SMTP.

## 7. Venta en tienda (presencial)

`POST /api/vendedor/ventas` registra una venta hecha en el mostrador. Queda como pedido con
`origen = tienda`, estado `completado` y `metodo_pago = manual`, y descuenta el stock en la misma transacción.

Formas de pago:

- **Efectivo**: se indica el dinero recibido. Debe cubrir el total y el sistema calcula el **cambio** (recibido − total).
- **Tarjeta (datáfono)** y **transferencia**: se cobra el total exacto; el cambio es 0.

Cada venta guarda el vendedor, el turno en que se hizo, la forma de pago, lo recibido y el cambio.
En pedidos, la venta aparece con origen «Tienda» y el vendedor que la registró.

## 7.1 Promociones

Cada producto tiene como máximo **una promoción activa** (índice único parcial en la base de datos).
Tipos:

- `porcentaje`: descuento sobre el precio unitario (`valor` de 1 a 99).
- `monto`: descuento fijo en pesos por unidad (no puede superar el precio).
- `nxm`: por cada grupo de `lleva` unidades se cobran `paga` (`lleva` ≥ 2, `1 ≤ paga < lleva`). Ejemplo: 2x1.

Quien gestiona promociones necesita el permiso `gestionar_promociones` (el superadministrador lo tiene siempre).
Ver y cotizar no lo requieren. Una promoción NxM no cambia el precio unitario del catálogo; el descuento aparece
al cotizar o comprar.

## 7.2 Facturas estándar

**Toda venta y toda compra web genera una factura interna** (`FV-000001`), la pida o no el cliente, para que
quede registrada para consultas posteriores. Si no se indicaron datos, la factura queda a nombre de
«Consumidor final» con la cédula verificada.

El cliente puede pedir que la factura salga con sus datos en tres momentos:

- En la venta en tienda: `factura: { nombre, identificacion }` en `POST /api/vendedor/ventas`.
- En la compra web: `factura: { nombre, identificacion }` en `POST /api/pedidos`.
- Después de cualquier pedido: `POST /api/pedidos/:id/factura`. Actualiza nombre e identificación de la
  factura existente **sin cambiar su número**. Pueden pedirla el comprador, el vendedor que vendió y el superadministrador.

La factura queda guardada y su PDF se obtiene con `GET /api/pedidos/:id/factura`.

**Paneles de facturas guardadas** (`GET /api/facturas?alcance=todas|propias`):

- El comprador ve sus facturas en «Mis compras» (vía `GET /api/pedidos`).
- El vendedor ve las facturas de todas las ventas de los turnos en que marcó entrada hoy (fecha en Bogotá),
  incluidas las de otros vendedores de ese mismo turno. Sin entrada hoy no ve ninguna.
- El superadministrador ve `todas` (por defecto) o `propias`, que son solo las ventas que él registró.
  Con `turno=<id>` filtra por turno, para seguir todas las facturas que se procesaron en ese turno.
  Cada respuesta incluye `resumen` con cantidad, total e IVA para auditoría.

Los pedidos anteriores a la migración 5 no tienen factura interna. Se les puede generar una
manualmente con `POST /api/pedidos/:id/factura`.

**Importante:** es una factura estándar, no una factura electrónica. Una factura electrónica con validez fiscal
requiere habilitación ante la DIAN y un proveedor tecnológico. El PDF lo aclara en el pie.

## 7.3 IVA

El IVA es el 19% del valor después de promociones y descuentos (`TASA_IVA` en `server/src/servicios/impuestos.js`).
Se suma al precio: el total del pedido es la base más el IVA. Se guardan `iva` y `total` en cada pedido.
Los pedidos anteriores a esta versión no tienen IVA registrado (`iva = 0`).
La cotización devuelve `subtotal` (base), `iva` y `total`.

## 8. API

Todas las rutas están bajo `/api`. Las respuestas son JSON. La sesión viaja en la cookie `sid` (HttpOnly).

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/auth/registro` | Público | Crea cuenta de cliente e inicia sesión |
| POST | `/auth/login` | Público | `{ identificador, password }` |
| POST | `/auth/logout` | Sesión | Cierra la sesión |
| GET | `/auth/me` | Sesión | Usuario actual |
| POST | `/auth/cambiar-password` | Sesión | `{ actual, nueva }` |
| GET | `/auth/perfil` | Sesión | Nombre, correo, celular, fecha de nacimiento y cédula, con `fechaBloqueada` / `identificacionBloqueada` |
| PUT | `/auth/perfil` | Sesión | `{ nombre?, email?, telefono?, fechaNacimiento?, identificacion? }`. Fecha y cédula se registran una sola vez |
| GET | `/pedidos/mios` | Sesión | Pedidos de la propia cuenta (también para el administrador) |
| GET | `/favoritos` | Sesión | Productos guardados («Guardados») |
| POST | `/favoritos` | Sesión | `{ productoId }` → guarda un producto |
| DELETE | `/favoritos/:productoId` | Sesión | Quita un producto guardado |
| GET | `/productos` | Público | Catálogo (excluye inactivos); incluye `precioFinal`, `promocion` y `stock` |
| POST | `/pedidos/cotizacion` | Público | `{ items }` → subtotal, IVA, total, descuento, líneas y disponibilidad, sin registrar nada |
| POST | `/pedidos/:id/factura` | Comprador, vendedor, superadmin | `{ nombre, identificacion }` → pide la factura (idempotente) |
| GET | `/pedidos/:id/factura` | Comprador, vendedor, superadmin | PDF de la factura estándar (si ya existe) |
| GET | `/promociones` | Vendedor / Superadmin | Lista de promociones |
| POST | `/promociones` | Con `gestionar_promociones` | `{ productoId, nombre, tipo, valor? \| lleva? + paga?, activa? }` |
| PUT | `/promociones/:id` | Con `gestionar_promociones` | Edita o activa/desactiva |
| DELETE | `/promociones/:id` | Con `gestionar_promociones` | Elimina |
| GET | `/productos/:id` | Público | Detalle |
| POST | `/pedidos` | Sesión | `{ items: [{ productoId, cantidad }], direccion, metodoPago, verificacion, factura? }` |
| GET | `/facturas` | Vendedor / Superadmin | `?alcance=todas\|propias&turno=<id>` → facturas y `resumen` (ver 7.2) |
| GET | `/pedidos` | Sesión | Pedidos propios (superadmin: todos) |
| GET | `/pedidos/:id` | Sesión | Detalle, solo si es propio o superadmin |
| GET | `/notificaciones` | Sesión | Avisos del usuario y cantidad sin leer |
| POST | `/notificaciones/:id/leer` | Sesión | Marca un aviso como leído |
| GET | `/vendedor/panel` | Vendedor / Superadmin | Jornada, turno de hoy, próximos turnos, permisos y avisos |
| POST | `/vendedor/jornada/entrada` | Vendedor | Marca entrada (requiere turno asignado hoy) |
| POST | `/vendedor/jornada/salida` | Vendedor | Marca salida |
| GET | `/vendedor/pedidos` | Vendedor / Superadmin | Pedidos del turno de hoy (ventas de tienda y web atendidos); el superadministrador ve todos |
| GET | `/vendedor/pedidos-web` | Vendedor / Superadmin | Cola web: pendientes y atendidos en su turno (requiere entrada abierta) |
| POST | `/vendedor/pedidos/:id/atender` | Vendedor (con entrada) / Superadmin | Toma un pedido web pendiente (409 si ya lo tomó otro) |
| PATCH | `/vendedor/pedidos/:id/estado` | Vendedor que lo atiende / Superadmin | `{ estado: completado \| cancelado }` |
| GET | `/vendedor/ventas` | Vendedor / Superadmin | Ventas de tienda (el vendedor, las suyas) |
| POST | `/vendedor/ventas` | Vendedor (con entrada) / Superadmin | `{ items, formaPago, pagoRecibido?, verificacion, factura? }` |
| GET | `/vendedor/productos` | Vendedor / Superadmin | Productos para vender y editar |
| PATCH | `/vendedor/productos/:id` | Vendedor (según permisos) / Superadmin | Solo los campos que el permiso cubre |
| GET | `/admin/resumen` | Superadmin | Indicadores del negocio |
| GET | `/admin/productos` | Superadmin | Incluye inactivos |
| POST | `/admin/productos` | Superadmin | Crea producto |
| PUT | `/admin/productos/:id` | Superadmin | Edita precio, stock, estado (`inactivo` / activo). Las promociones van por `/promociones` |
| DELETE | `/admin/productos/:id` | Superadmin | Elimina el producto. Los pedidos ya hechos se conservan (nombre y precio); solo se pierde el enlace al producto |
| POST | `/admin/productos/:id/imagen` | Superadmin | Sube una foto PNG, JPG o WEBP (cuerpo binario, máx. 3 MB, validada por contenido). Se guarda en `img/productos/` y reemplaza la anterior |
| PATCH | `/admin/pedidos/:id/estado` | Superadmin | `{ estado: completado \| cancelado }` |
| GET | `/admin/turnos` | Superadmin | Lista de turnos |
| POST | `/admin/turnos` | Superadmin | `{ nombre, horaInicio, horaFin, activo? }` |
| PUT | `/admin/turnos/:id` | Superadmin | Edita nombre, horario o estado |
| GET | `/admin/asignaciones` | Superadmin | Asignaciones; `?desde=&hasta=` (por defecto próximos 14 días; el panel usa desde hace 7 días) |
| POST | `/admin/asignaciones` | Superadmin | `{ usuarioId, turnoId, fecha }` |
| DELETE | `/admin/asignaciones/:id` | Superadmin | Quita una asignación de hoy en adelante (409 si es de una fecha pasada) |
| GET | `/admin/vendedores` | Superadmin | Vendedores con sus permisos y catálogo de permisos |
| PUT | `/admin/vendedores/:id/permisos` | Superadmin | `{ permisos: [...] }` |
| GET | `/admin/jornadas` | Superadmin | Entradas y salidas de una fecha (`?fecha=AAAA-MM-DD`) |
| GET | `/admin/usuarios` | Superadmin | Lista de cuentas |
| PATCH | `/admin/usuarios/:id` | Superadmin | `{ rol?, activo? }` |
| GET | `/admin/auditoria` | Superadmin | Últimos 200 registros |

Los errores responden con `{ error, detalles? }` y el código HTTP correspondiente.

## 9. Páginas

| Página | Quién entra | Contenido |
|---|---|---|
| `index.html`, `index_productos.html`, … | Todos | Tienda |
| `index_admin.html` | Superadmin | Resumen, productos, pedidos, turnos, vendedores, jornadas, usuarios, auditoría |
| `index_vendedor.html` | Vendedor y superadmin | Inicio (jornada, turno, notificaciones), venta en tienda, mis ventas, productos |

Al iniciar sesión, cada rol va a su página: superadmin → panel, vendedor → módulo de vendedor, cliente → tienda.

## 10. Seguridad aplicada

- Contraseñas con scrypt y sal única; nunca en texto plano.
- Tokens de sesión aleatorios de 256 bits; en la base solo se guarda su hash.
- Cookie `HttpOnly` y `SameSite=Lax`; `Secure` en producción.
- Roles y permisos se comprueban en cada ruta del servidor, no solo en la pantalla.
- Las carpetas `server/`, `data/` y `tests/` y `package.json` no se publican.
- Límite de 100 KB por solicitud JSON.
- Las ventas y los cambios de stock se hacen en transacciones `BEGIN IMMEDIATE`: dos ventas simultáneas no pueden vender más unidades de las que existen.

Pendiente para fases posteriores: verificación de correo al registrarse, limitar intentos de inicio de sesión,
protección CSRF adicional si se permiten formularios de otros sitios, y rotación de sesiones al cambiar contraseña.

## 11. Despliegue en Render o Railway

- Build: `npm install`
- Start: `npm start`
- Variables: `NODE_ENV=production`, `ADMIN_PASSWORD=<una contraseña propia>`.

Con disco efímero, la base de datos se reinicia con cada despliegue: los productos vuelven
a cargarse desde el JSON, pero los usuarios registrados, pedidos, ventas, turnos y cambios de stock se pierden.
Para conservarlos se necesita un disco persistente (Render) o un volumen (Railway) montado en la ruta de `DB_PATH`.
