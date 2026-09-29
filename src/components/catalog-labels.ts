import type { Product } from "@/lib/types";

// Formato de etiquetas de filtros para mostrar al cliente. Solo cambia cómo se ven:
// el valor que viaja en la URL y se compara en la base queda igual.
export function filterLabel(value: string) {
  const text = value.replace(/-/g, " ").trim();
  return text ? text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1) : value;
}

// Precio "desde" que muestra la tarjeta: el más bajo entre las presentaciones con stock,
// o el de la primera presentación si no hay stock. El orden por precio usa este mismo valor.
export function cardPriceCents(product: Product) {
  const available = product.variants.filter((variant) => variant.totalStock > 0);
  return available.length ? Math.min(...available.map((variant) => variant.priceCents)) : product.variants[0]?.priceCents ?? 0;
}
