import { isSpecialCategorySlug } from "./special-categories";
import type { Category, Product } from "./types";

/*
 * Facetas contextuales de /tienda, calculadas en memoria sobre el catálogo que ya se trajo.
 * Cada grupo (marca, edad, tamaño, etc.) cuenta los productos que cumplen TODOS los filtros activos
 * menos el de ese mismo grupo: así solo aparecen opciones que dan resultados y se puede sumar más de una.
 * productMatches replica los filtros de getProducts (db-sqlite.ts / db-postgres.ts); si cambian allá, cambiar acá.
 */

export type FacetFilters = {
  category?: string | string[];
  subcategory?: string | string[];
  pet?: string;
  brand?: string | string[];
  stage?: string | string[];
  size?: string | string[];
  need?: string | string[];
  presentation?: string | string[];
  minPrice?: string;
  maxPrice?: string;
  stock?: string;
};

type Group = "category" | "subcategory" | "pet" | "brand" | "stage" | "size" | "need" | "presentation" | "price";

export type FacetCount = { name: string; count: number };
export type ContextualFacets = {
  categories: (FacetCount & { slug: string })[];
  subcategories: (FacetCount & { slug: string; categorySlug: string })[];
  species: FacetCount[];
  brands: FacetCount[];
  lifeStages: FacetCount[];
  /** Conteo exacto por tamaño; a cada opción hay que sumarle una vez sizeAllCount (productos "todos"). */
  sizes: FacetCount[];
  sizeAllCount: number;
  needs: FacetCount[];
  presentations: FacetCount[];
  priceRange: { min: number; max: number };
};

// Productos sin subcategoría: la base guarda "" y getProducts no los filtra por este valor, así que no se ofrece.
const uncategorizedSubcategorySlug = "sin-subcategoria";

function values(input?: string | string[]) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean);
}

function cents(input?: string) {
  if (!input) return null;
  const value = Math.round(Number(input) * 100);
  return Number.isFinite(value) ? value : null;
}

export type CatalogContext = {
  /** slug de categoría → slug de su categoría padre (el filtro de categoría incluye las hijas). */
  parentOf: Map<string, string | null>;
  /** Ids que devolvió la búsqueda de texto; null si no hay búsqueda. */
  searchIds: Set<number> | null;
};

export function catalogContext(categories: Category[], searchIds: number[] | null): CatalogContext {
  return {
    parentOf: new Map(categories.map((category) => [category.slug, category.parentCategorySlug])),
    searchIds: searchIds ? new Set(searchIds) : null,
  };
}

/** Mismo criterio que getProducts. `skip` deja afuera el filtro de uno o más grupos (para contar sus opciones). */
export function productMatches(product: Product, filters: FacetFilters, context: CatalogContext, skipGroups?: Group | Group[]) {
  const skipped = new Set(Array.isArray(skipGroups) ? skipGroups : skipGroups ? [skipGroups] : []);
  const skip = (group: Group) => skipped.has(group);
  if (context.searchIds && !context.searchIds.has(product.id)) return false;
  const categories = values(filters.category);
  if (!skip("category") && categories.length) {
    const parent = context.parentOf.get(product.categorySlug) ?? null;
    if (!categories.includes(product.categorySlug) && !(parent && categories.includes(parent))) return false;
  }
  const subcategories = values(filters.subcategory);
  if (!skip("subcategory") && subcategories.length && !subcategories.includes(product.subcategorySlug)) return false;
  if (!skip("pet") && filters.pet && filters.pet !== "todos" && product.species !== filters.pet && product.species !== "perro-gato") return false;
  const brands = values(filters.brand);
  if (!skip("brand") && brands.length && !brands.includes(product.brand)) return false;
  const stages = values(filters.stage);
  if (!skip("stage") && stages.length && !stages.includes(product.lifeStage)) return false;
  const sizes = values(filters.size);
  if (!skip("size") && sizes.length && !sizes.includes(product.size) && product.size !== "todos") return false;
  const needs = values(filters.need);
  if (!skip("need") && needs.length && !needs.includes(product.need)) return false;
  const presentations = values(filters.presentation).map((item) => item.toLowerCase());
  if (!skip("presentation") && presentations.length
    && !product.variants.some((variant) => presentations.some((item) => variant.label.toLowerCase().includes(item)))) return false;
  if (!skip("price")) {
    const min = cents(filters.minPrice);
    const max = cents(filters.maxPrice);
    if ((min !== null || max !== null)
      && !product.variants.some((variant) => (min === null || variant.priceCents >= min) && (max === null || variant.priceCents <= max))) return false;
  }
  if (filters.stock === "disponible" && !product.variants.some((variant) => variant.stocks.some((stock) => stock.quantity > 0))) return false;
  return true;
}

function tally(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) if (item) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export function contextualFacets(catalog: Product[], filters: FacetFilters, categories: Category[], context: CatalogContext): ContextualFacets {
  const base = (skip: Group | Group[]) => catalog.filter((product) => productMatches(product, filters, context, skip));
  const categoryName = new Map(categories.map((category) => [category.slug, category.name]));

  // Categoría y subcategoría forman un solo filtro (el árbol): se cuentan sin ninguno de los dos, así todos
  // los niveles muestran cuántos productos da cada opción con el resto de los filtros.
  // Cada producto suma a su categoría y a la categoría padre (el filtro las incluye a las dos).
  const treeBase = base(["category", "subcategory"]);
  const categoryCounts = new Map<string, number>();
  for (const product of treeBase) {
    const slugs = new Set([product.categorySlug, context.parentOf.get(product.categorySlug) ?? ""]);
    for (const slug of slugs) if (slug && !isSpecialCategorySlug(slug)) categoryCounts.set(slug, (categoryCounts.get(slug) ?? 0) + 1);
  }
  const subcategoryCounts = new Map<string, FacetCount & { slug: string; categorySlug: string }>();
  for (const product of treeBase) {
    if (product.subcategorySlug === uncategorizedSubcategorySlug) continue;
    const current = subcategoryCounts.get(product.subcategorySlug);
    if (current) current.count += 1;
    else subcategoryCounts.set(product.subcategorySlug, { slug: product.subcategorySlug, name: product.subcategory, categorySlug: product.categorySlug, count: 1 });
  }

  // Tamaño: el filtro también trae los productos marcados "todos"; ese total se devuelve aparte para
  // sumarlo una sola vez por opción (aunque la opción agrupe "pequeno" y "pequeño"). "todos" no se ofrece.
  const sizeBase = base("size");
  const sizeAllCount = sizeBase.filter((product) => product.size === "todos").length;
  const sizes = tally(sizeBase.map((product) => product.size)).filter((item) => item.name !== "todos");

  // Presentación: el filtro busca el texto dentro de la etiqueta ("85 g" también encuentra "Pollo 85 g").
  const presentationBase = base("presentation");
  const labels = [...new Set(presentationBase.flatMap((product) => product.variants.map((variant) => variant.label)))];
  const presentations = labels.map((label) => {
    const needle = label.toLowerCase();
    return { name: label, count: presentationBase.filter((product) => product.variants.some((variant) => variant.label.toLowerCase().includes(needle))).length };
  });

  const priceBase = base("price");
  const prices = priceBase.flatMap((product) => product.variants.map((variant) => Math.round(variant.priceCents / 100)));

  return {
    categories: [...categoryCounts.entries()].map(([slug, count]) => ({
      slug,
      name: categoryName.get(slug) ?? catalog.find((product) => product.categorySlug === slug)?.category ?? slug,
      count,
    })),
    subcategories: [...subcategoryCounts.values()],
    species: tally(base("pet").map((product) => product.species)),
    brands: tally(base("brand").map((product) => product.brand)),
    lifeStages: tally(base("stage").map((product) => product.lifeStage)),
    sizes,
    sizeAllCount,
    needs: tally(base("need").map((product) => product.need)),
    presentations,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 },
  };
}

/*
 * Árbol de categorías del panel de gestión para el filtro: principal › categorías internas › subcategorías.
 * Mismo origen y orden que el menú del header (getCategories: principales, sus internas por nombre; las
 * categorías especiales quedan afuera). Las subcategorías salen de getSubcategories (orden por nombre) y de los
 * productos, así una categoría o subcategoría nueva con productos aparece sola. Contadores contextuales; se ocultan
 * las ramas sin productos salvo lo que el cliente ya eligió.
 */
export type CategoryTreeNode = {
  kind: "category" | "subcategory";
  slug: string;
  name: string;
  count: number;
  selected: boolean;
  children: CategoryTreeNode[];
};

export function buildCategoryTree(
  categories: Category[],
  subcategories: { slug: string; name: string; categorySlug: string | null }[],
  facets: ContextualFacets,
  selected: { categories: string[]; subcategories: string[] },
): CategoryTreeNode[] {
  const categoryCount = new Map(facets.categories.map((item) => [item.slug, item.count]));
  const subcategoryCount = new Map(facets.subcategories.map((item) => [item.slug, item.count]));
  const visible = (node: CategoryTreeNode) => node.count > 0 || node.selected || node.children.length > 0;

  const subcategoryNodes = (categorySlug: string): CategoryTreeNode[] => {
    const known = subcategories.filter((item) => item.categorySlug === categorySlug);
    // Subcategorías que solo existen en los productos (cargadas a mano) también cuentan.
    const fromProducts = facets.subcategories
      .filter((item) => item.categorySlug === categorySlug && !known.some((sub) => sub.slug === item.slug))
      .map((item) => ({ slug: item.slug, name: item.name, categorySlug }));
    return [...known, ...fromProducts]
      .map((item) => ({
        kind: "subcategory" as const,
        slug: item.slug,
        name: item.name,
        count: subcategoryCount.get(item.slug) ?? 0,
        selected: selected.subcategories.includes(item.slug),
        children: [],
      }))
      .filter(visible);
  };

  const categoryNode = (category: Category): CategoryTreeNode => {
    const internal = categories
      .filter((child) => child.parentCategorySlug === category.slug && !isSpecialCategorySlug(child.slug))
      .map(categoryNode);
    return {
      kind: "category",
      slug: category.slug,
      name: category.name,
      count: categoryCount.get(category.slug) ?? 0,
      selected: selected.categories.includes(category.slug),
      children: [...internal, ...subcategoryNodes(category.slug)].filter(visible),
    };
  };

  return categories
    .filter((category) => !category.parentCategorySlug && !isSpecialCategorySlug(category.slug))
    .map(categoryNode)
    .filter(visible);
}

/** Camino desde la raíz hasta el nodo buscado (para la ruta "Tienda › Categoría › Subcategoría"). */
export function categoryTreePath(nodes: CategoryTreeNode[], match: (node: CategoryTreeNode) => boolean): CategoryTreeNode[] {
  for (const node of nodes) {
    if (match(node)) return [node];
    const inner = categoryTreePath(node.children, match);
    if (inner.length) return [node, ...inner];
  }
  return [];
}
