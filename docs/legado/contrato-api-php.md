# Contrato de la API PHP perdida (deducido del front CRA)

> **Documento histórico de referencia.** El backend PHP (`cheveposapi.codelabs.com.mx/Endpoints/...`)
> y su base se perdieron. Todo lo de aquí se dedujo de lo que lee y envía `legacy/front-cra`
> (extraído 2026-11-23). La API nueva **no** copia este contrato: lo usa solo para saber qué
> pantallas y datos existían. `(?)` = inferencia no confirmada.

## Resumen

- 49 endpoints PHP: auth 4, `Gets/` 26, `Insert/` 8, `Update/` 5, `Delete/` 6.
- JWT en cookie `authToken` (no httpOnly), enviado como `Authorization: Bearer`. Claims leídos: `nombre`, `nombre_rol`.
- Usuario y contraseña viajaban cifrados con RSA-OAEP (llave pública 1024 bits en `src/Data/DataEncrypt.jsx`).
- Sin control por rol: cualquier usuario con sesión veía todo.
- Respuestas: `{ success, message, Data | products }`.
- Imágenes: `/img/Products/<imagen_producto>`.

## Pantallas que existían

| Ruta | Qué hacía | Endpoints |
|---|---|---|
| `/admin-dashboard` | KPIs (TotalProducto, TotalDinero, TotalEgresos, TotalVentas, Clientes, Pedidos, TotalProductos), gráfica ventas vs compras por año, últimos productos comprados, productos "vencidos" | `getDataDash`, `GetDataProfits`, `getproducts`, `getlastProducts` |
| `/pos` | Mosaicos de categoría, grid de productos, carrito, selección de cliente, pago Efectivo/Transferencia, ticket, últimas 5 órdenes, alta rápida de cliente | `getPOSData`, `getProductsPOS`, `InsertPOSVenta`, `getSalesbyID` |
| `/product-list` | Inventario, editar, entrada/salida de stock, borrar, exportar | `getProductsInventory`, `UpdateProducto`, `add2inventory`, `DeleteProduct` |
| `/add-product` | Alta de producto con imagen | `InsertProduct`, `getCategories`, `getSubcategories`, `getUnits` |
| `/low-stocks` | Bajo mínimo y agotados | `getLowStock`, `getOutStock` |
| `/category-list`, `/sub-categories` | CRUD categorías/subcategorías | `getCategoriesTable`, `getSubcategorieTable`, `Insert*`, `Delete*` |
| `/customers` | CRUD clientes | `getClientes`, `InsertarCliente`, `updateCliente`, `DeleteCliente` |
| `/sales-report` | Ventas por rango de fechas, detalle de ticket | `getSales`, `getSalesbyID` |
| `/purchase-report` | Compras por rango, alta de compra (modal) | `getPurchases`, `InsertCompra` |
| `/profit-loss-report` | Estado de resultados por año/mes | `getProfitsByYear`, `getProfitsMounthYear`, `getAvaibleYears` |
| `/users`, `/roles-permissions` | CRUD usuarios y roles (sin matriz de permisos) | `getUsers`, `getRolesAvaible`, `getTableRoles`, `InsertUsuario`, `UpdateUser`, `DeleteUser`, `InsertarRoles`, `updateRol`, `DeleteRol` |
| `/signin`, `/forgot-password`, `/reset-password`, `/email-verification` | Login y recuperación por correo | `auth/login`, `auth/validatelogin`, `auth/forgotpass`, `auth/resend_verification` |
| — | Campana de notificaciones en el header | `getNotification` |

## Datos por dominio (campos que usaba el front)

### Auth
- `auth/login.php` POST FormData `usuario`, `contrasena` (ambos RSA) → `{ success, token, message }`.
- `auth/validatelogin.php` POST FormData `token` → `{ success }`. La misma URL servía para reset: `codigo`, `contrasena_nueva`.
- `auth/forgotpass.php` POST `Correo` (RSA). `auth/resend_verification.php` POST `Correo`.

### Usuarios y roles
- Usuario: `id`, `nombre_usuario`, `usuario`, `telefono`, `correo`, `rol_id`, `nombre_rol`, `estado` (1/0), `creado_en`.
- Alta: `nombre_usuario`, `usuario`, `correo`, `phone`, `role`, `estado`, `password` (RSA).
- Edición: `userId`, `rol_id`, `correo`, `telefono`, `password?`, `estado`.
- Rol: `id`, `nombre_rol`, `creado_en`, `nombre_usuario` (creador). Alta JSON `{ role }`; edición `idRol`, `nombre_rol`.
- Opciones de select: `{ value, label }`.

### Clientes (establecimientos)
- `id`, `nombre`, `correo`, `telefono`, `direccion`, `fecha_insercion`.
- Alta JSON `{ customerName, email, phone, address }`; edición `idCliente`, `nombre`, `correo`, `telefono`, `direccion`.

### Catálogo
- Categoría: `id`, `valor` (nombre), `etiqueta` (descripción), `estatus`, `fechainsercion`.
- Subcategoría: `id`, `valor`, `etiqueta`, `categoria_id`, `CategoriaPadre`, `UsuarioCreador`, `estatus`, `fechainsercion`.
- Unidades: solo opciones `{ value, label }`.

### Productos e inventario
- Producto: `id`, `nombre_producto`, `Categoria`, `Subcategoria`, `Unidad`, `precio_compra`, `precio_venta`, `cantidad`, `cantidadMinima`, `imagen_producto`, `creado_en`, `FechaActualizacion`, `nombre_usuario`.
- Alta FormData: `nombre_producto`, `unidad_id`, `categoria_id`, `subcategoria_id`, `precio_compra`, `precio_venta`, `cantidad`, `cantidad_minima`, `imagen_producto` (File).
- Movimiento: `add2inventory.php` `productId`, `operation` (`add`|`remove`), `quantity`.

### Compras
- Listado por `fecha_inicio`/`fecha_fin`: `fecha_compra`, `nombre`, `cantidad`, `precio_unitario`, `total`, `Vendedor`.
- Alta JSON `{ nombreProducto, cantidad, precioUnitario, fechaCompra }`. Sin proveedor, sin ligar a producto por id (?).

### Ventas / POS
- Alta `InsertPOSVenta.php`: `{ productos: [{ productId, cantidadCarrito }], metodo_pago: "Efectivo"|"Transferencia", cliente_id }` → `{ success, venta_id }`.
- Listado por rango: `venta_id`, `ticket`, `fecha`, `subtotal`, `impuesto`, `total` (string con `$`), `realizado_por`.
- Ticket (`getSalesbyID.php` `SaleID`): `companyName`, `companyPhone`, `companyEmail`, `ticket`, `cliente_nombre`, `Vendedor`, `date`, `items[] { name, price, qty }`, `subtotal`, `impuesto`, `total`, `due`, `totalPayable`.
- Últimas órdenes: `id`, `Vendedor`, `Cliente`, `Fecha`, `Total`.

### Reportes
- Ganancias por año (`Year`) o mes (`Year`, `Mounth`): `{ months[], finances: { income: [{ category, values[] }] } }`.
- Dashboard ventas/compras: `{ years[], data, categories[] }`.

### Notificaciones
- `id`, `img`, `user`, `message`, `time`.

## Fallas del sistema viejo que no se repiten

- JWT legible por JS (cookie no httpOnly) y token en FormData.
- Cifrado RSA en el cliente en lugar de HTTPS + hash en servidor.
- Sin autorización por rol.
- Dinero como string con `$`; nombres de campos inconsistentes (`Mounth`, exportaciones con llaves que no existen).
- Compras sin proveedor ni producto ligado; stock movido sin bitácora de movimientos (?).
- URL de la API escrita a mano en ~50 archivos.
