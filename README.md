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

La base local SQLite (`data/agrovet.sqlite`) solo sirve para desarrollo. En Vercel la app usa `DATABASE_URL` y guarda todo en Postgres, asi dos computadoras administrando el panel ven el mismo stock, ventas y productos.

### Migrar datos actuales a Postgres

1. Crear una base Postgres administrada, por ejemplo desde Vercel Marketplace, Neon o Supabase.
2. Configurar `DATABASE_URL` localmente con la URL de esa base.
3. Ejecutar:

```powershell
npm run db:migrate:postgres -- --reset
```

`--reset` vacia la base Postgres antes de copiar los datos de `data/agrovet.sqlite`. Usarlo solo para la primera carga o cuando se quiera reemplazar todo el contenido remoto.

### Vercel

En Project Settings > Environment Variables configurar:

- `ADMIN_PASSWORD`: codigo numerico de 8 a 12 digitos.
- `AUTH_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `DATABASE_URL`: conexion Postgres compartida.

Despues de cargar datos y variables, correr `npm run build` localmente y hacer deploy desde Vercel conectado al repositorio.
