# Agrovet Mar del Plata

Aplicacion web y panel de gestion para Agrovet Mar del Plata.

## Incluido

- Tienda online responsive con buscador, categorias, filtros y carrito.
- Productos con variantes, precios y stock por sucursal.
- Pedidos web con retiro o envio, descuento de stock y seguimiento desde admin.
- Panel `/admin` con login numerico, caja, ventas, clientes mayoristas, inventario, categorias y reportes PDF.
- Sincronizacion visual entre sesiones mediante `/api/sync-version`.

## Ejecutar en desarrollo

```powershell
npm install
npm run dev
```

Abrir `http://localhost:3000`.

El acceso al panel usa el codigo numerico configurado en `.env.local`:

```env
ADMIN_PASSWORD=1234567890
AUTH_SECRET=un-secreto-aleatorio-de-al-menos-32-caracteres
```

## Verificacion

```powershell
npm run lint
npm run build
```

## Produccion

No subir `.env.local`, bases locales ni archivos generados. Las variables deben configurarse en el hosting:

```env
ADMIN_PASSWORD=1234567890
AUTH_SECRET=un-secreto-aleatorio-de-al-menos-32-caracteres
DATABASE_URL=postgres://...
```

La base local SQLite (`data/agrovet.sqlite`) solo sirve para desarrollo. Para produccion en Vercel se debe usar una base persistente administrada, por ejemplo Postgres.
