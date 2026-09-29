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

// Valores cargados a mano que solo difieren en tildes, ñ o mayúsculas ("pequeno" y "pequeño")
// se muestran como UNA opción; al elegirla se filtra por todos los valores reales del grupo.
export type FacetGroup = { label: string; values: string[] };
export const groupSeparator = "||";

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const hasAccents = (value: string) => fold(value) !== value.toLowerCase().trim();

export function groupFacetValues(items: { name: string; count?: number }[], format: (value: string) => string = (value) => value): FacetGroup[] {
  const groups = new Map<string, { name: string; count: number }[]>();
  for (const item of items) {
    if (!item.name) continue;
    const key = fold(item.name);
    groups.set(key, [...(groups.get(key) ?? []), { name: item.name, count: item.count ?? 0 }]);
  }
  return [...groups.values()].map((members) => {
    // Etiqueta: la versión bien escrita (con tildes o ñ); si no hay, la más usada.
    const best = [...members].sort((a, b) => Number(hasAccents(b.name)) - Number(hasAccents(a.name)) || b.count - a.count)[0];
    return { label: format(best.name), values: members.map((member) => member.name) };
  });
}

/** Cuenta opciones elegidas: un grupo cuenta una vez aunque tenga varios valores en la URL. */
export function countSelectedGroups(groups: FacetGroup[], selected: string[]) {
  const grouped = groups.filter((group) => group.values.some((value) => selected.includes(value)));
  const loose = selected.filter((value) => !groups.some((group) => group.values.includes(value)));
  return grouped.length + loose.length;
}
