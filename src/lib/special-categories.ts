export const specialCategories = [
  { slug: "promociones-bancarias", name: "Promociones bancarias", href: "/promociones-bancarias" },
  { slug: "envios", name: "Envios", href: "/envios" },
  { slug: "servicios", name: "Servicios", href: "/servicios" },
  { slug: "preguntas-frecuentes", name: "Preguntas frecuentes", href: "/preguntas-frecuentes" },
  { slug: "contacto", name: "Contacto", href: "/contacto" },
] as const;

export const specialCategorySlugs = specialCategories.map((category) => category.slug);

export function isSpecialCategorySlug(slug: string) {
  return specialCategorySlugs.includes(slug as (typeof specialCategories)[number]["slug"]);
}

export function getSpecialCategoryHref(slug: string) {
  return specialCategories.find((category) => category.slug === slug)?.href;
}

export function getSpecialCategoryOrder(slug: string) {
  const index = specialCategorySlugs.indexOf(slug as (typeof specialCategories)[number]["slug"]);
  return index === -1 ? 999 : index;
}
