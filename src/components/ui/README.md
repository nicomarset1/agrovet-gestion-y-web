# Controles propios (`src/components/ui`)

Reemplazos de los controles nativos del navegador, con la estética de la marca. Los estilos están en
`src/app/styles/polish-shell.css` (sección "Controles propios" y "Campos de formulario de la marca").

| Componente | Archivo | Reemplaza a |
| --- | --- | --- |
| `Select` | `select.tsx` | `<select>` |
| `DateRangePicker` | `date-range-picker.tsx` | dos `<input type="date">` de desde y hasta |
| `DatePicker` | `date-picker.tsx` | `<input type="date">` |
| `Checkbox`, `Radio`, `Switch` | `form-controls.tsx` | `<input type="checkbox">` y `<input type="radio">` |
| `NumberInput` | `form-controls.tsx` | `<input type="number">` (con botones − y +) |
| `.field` | CSS | `<input>` de texto y `<textarea>`: ya tienen foco, error (`aria-invalid="true"`) y disabled |

## Reglas para usarlos

- **Formularios y server actions.** `Select`, `DatePicker` y `DateRangePicker` mandan el valor con un
  `<input type="hidden">` si les pasás `name` (`nameFrom` y `nameTo` en el rango). Checkbox, Radio, Switch y
  NumberInput son inputs reales, así que `name`, `defaultChecked`, `defaultValue` y `onChange` funcionan igual.
- **`required` en un input oculto no lo valida el navegador.** Si hoy dependés del `required` de un `<select>`,
  validalo en la server action (ya se hace en la mayoría) o no dejes una opción vacía.
- **Enviar al cambiar.** Donde hoy hay `onChange={(e) => e.currentTarget.form?.requestSubmit()}`: en
  Checkbox y Switch sirve igual. En Select usá `onChange={() => formRef.current?.requestSubmit()}`,
  porque el valor oculto se actualiza en el mismo render.
- **Fechas** en formato `yyyy-mm-dd`, igual que el input nativo. Helpers en `date-utils.ts`.
  `DateRangePicker` llama a `onChange(desde, hasta)` solo con el rango completo, o vacío al tocar "Borrar".
- **Etiquetas.** Pasá `ariaLabel` o `ariaLabelledBy` (el id del `<label>` visible) al Select, y `ariaLabel` a los
  pickers. Si no, el lector de pantalla no sabe qué campo es.
- **Categorías con jerarquía** (`Perros › Alimento húmedo`):

  ```tsx
  const options: SelectItem[] = categories.flatMap((parent) => [
    { value: String(parent.id), label: parent.name },
    ...parent.children.map((child) => ({
      value: String(child.id), label: child.name, depth: 1, path: `${parent.name} › ${child.name}`,
    })),
  ]);
  <Select name="categoryId" defaultValue={String(selected)} options={options} ariaLabelledBy="label-categoria" />
  ```

  La búsqueda interna aparece sola con más de 8 opciones (`searchable` para forzarla o apagarla).

## Reemplazos pendientes en el panel (`src/components/admin-console.tsx`, para nicol-a1)

Las líneas son de `eae6453` y pueden haberse movido.

| Línea aprox. | Hoy | Pasa a |
| --- | --- | --- |
| 828 | `<select name="parentCategoryId">` | `Select` con `name`, con jerarquía si hay subcategorías |
| 897, 1145 | `<select name="categoryId">` | `Select` con jerarquía (depth y path) y búsqueda |
| 1169 | `<select name="subcategorySlug">` | `Select` controlado (`value` y `onChange`) con `name` |
| 1253, 1261, 1272 | `species`, `lifeStage`, `size` | `Select` con `name` y `defaultValue` (sin búsqueda) |
| 1534, 1813, 3176 | medio de pago (controlado) | `Select` con `value` y `onChange` |
| 1544, 1823, 2962, 3186 | cuotas (controlado) | `Select` con `value` y `onChange` |
| 1797 | `refundMethod` (required, "" por defecto) | `Select` con `name` (validar en la acción) |
| 1916 | asignación de sucursal por línea | `Select` controlado |
| 2945 | medio de pago de la Caja | `Select` controlado (mantener el `setPaidAmount("")`) |
| 3563, 3579, 3587 | filtros de productos (categoría, subcategoría, estado) | `Select` controlado. El de categoría con jerarquía y el de subcategoría con `disabled` |
| 3841, 3848, 3857 | reporte: sucursal, canal, medio de pago | `Select` controlado |
| 4049 | papelera: tipo | `Select` controlado |
| 2276 | `<input type="date">` día del dashboard | `DatePicker`, o `DateRangePicker` si el dashboard pasa a rangos |
| 3793 | `<input type="date">` facturación del día | `DatePicker` |
| 3837 | `<input type="month">` mes del reporte | `Select` con los últimos 12 meses (`value` "2026-09", label "Septiembre 2026") o `DateRangePicker` con los atajos "Este mes" y "Mes pasado" |
| 809, 850, 3632 | switches de mostrar en menú y activo (`.admin-switch`) | `Switch`. Cambiar al mismo onChange que ya tienen, incluido `requestSubmit` |
| 1245, 1353, 1357, 1361 | checkbox de marca frecuente, activo, destacado y requiere asesoramiento | `Checkbox` (o `Switch` para activo) |
| 1432, 1447, 1462, 1596, 1987, 2897, 2920, 2982, 3019 | `<input type="number">` | `NumberInput` donde tenga sentido −/+ (stock, cantidades). Para precios e importes alcanza con `.field` e `inputMode="decimal"` |
| 801, 816, 908, 1287, 1805, 2647 | `<textarea>` | Ya toman el estilo de `.field` (alto mínimo, foco y error). No hace falta cambiarlos |
