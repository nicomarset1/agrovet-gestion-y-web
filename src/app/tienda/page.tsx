import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, SearchX, X } from "lucide-react";
import { BranchesSection } from "@/components/branches-section";
import { cardPriceCents, filterLabel, groupFacetValues, type FacetGroup } from "@/components/catalog-labels";
import { ProductCard } from "@/components/product-card";
import { StoreFilterDrawer } from "@/components/store-filter-drawer";
import { StoreSortSelect } from "@/components/store-sort-select";
import { buildCategoryTree, catalogContext, categoryTreePath, contextualFacets, productMatches, type FacetCount } from "@/lib/catalog-facets";
import { getBranches, getCategories, getProducts, getSubcategories } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { productToSearchable, searchIds } from "@/lib/search";
import type { Category, Product } from "@/lib/types";

type Filters = {
  q?: string;
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
  sort?: string;
  ver?: string;
};
type Search = Promise<Filters>;

const pageSize = 24;
const sortOptions = [
  { value: "", label: "Destacados" },
  { value: "price_asc", label: "Menor precio" },
  { value: "price_desc", label: "Mayor precio" },
  { value: "stock_desc", label: "Más stock" },
];

function list(input?: string | string[]) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean);
}

// Arma un link a la tienda partiendo de los filtros actuales. Siempre vuelve a la primera tanda de productos.
function storeHref(filters: Filters, change: (params: URLSearchParams) => void) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "ver") continue;
    for (const item of list(value)) params.append(key, item);
  }
  change(params);
  const query = params.toString();
  return query ? `/tienda?${query}` : "/tienda";
}

function filtersFromHref(href: string): Filters {
  const params = new URLSearchParams(href.split("?")[1] ?? "");
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }
  return result as Filters;
}

function withoutValues(filters: Filters, key: string, values: string[]) {
  return storeHref(filters, (params) => {
    const rest = params.getAll(key).filter((item) => !values.includes(item));
    params.delete(key);
    for (const item of rest) params.append(key, item);
  });
}

// Un filtro activo por opción agrupada ("Pequeño" cubre "pequeno" y "pequeño").
function groupedPills(filters: Filters, key: keyof Filters, groups: FacetGroup[]) {
  const chosen = list(filters[key]);
  const pills = groups
    .filter((group) => group.values.some((value) => chosen.includes(value)))
    .map((group) => ({ label: group.label, href: withoutValues(filters, key, group.values) }));
  const loose = chosen
    .filter((value) => !groups.some((group) => group.values.includes(value)))
    .map((value) => ({ label: filterLabel(value), href: withoutValues(filters, key, [value]) }));
  return [...pills, ...loose];
}

function withoutValue(filters: Filters, key: string, value?: string) {
  return storeHref(filters, (params) => {
    const rest = value === undefined ? [] : params.getAll(key).filter((item) => item !== value);
    params.delete(key);
    for (const item of rest) params.append(key, item);
  });
}

// Suma las opciones que el cliente ya eligió aunque hoy den 0, para que se vean y se puedan sacar.
function withSelected(items: FacetCount[], selected: string[]) {
  const missing = selected.filter((value) => !items.some((item) => item.name === value));
  return [...items, ...missing.map((name) => ({ name, count: 0 }))];
}

// Catálogo con los filtros aplicados, calculado en memoria sobre el catálogo completo con el mismo criterio que
// getProducts (productMatches): así el listado y los contadores de los filtros coinciden siempre, sin otra consulta.
// La búsqueda de texto usa el mismo motor que el buscador del header, sobre el catálogo completo (así corrige y
// encuentra igual), y después se cruza con el resto de los filtros.
function findProducts(filters: Filters, catalog: Product[], categories: Category[]): { products: Product[]; correctedQuery: string | null; searchIds: number[] | null } {
  const query = filters.q?.trim();
  let fetched = catalog.filter((product) => productMatches(product, filters, catalogContext(categories, null)));
  if (filters.sort === "stock_desc") {
    // Mismo orden que la consulta: más stock primero y, a igual stock, por nombre.
    const stock = (product: Product) => product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
    fetched = [...fetched].sort((a, b) => stock(b) - stock(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  // El orden por precio sigue al precio que muestra la tarjeta (la consulta usa el mínimo de todas las presentaciones).
  const direction = filters.sort === "price_asc" ? 1 : filters.sort === "price_desc" ? -1 : 0;
  const filtered = direction ? [...fetched].sort((a, b) => direction * (cardPriceCents(a) - cardPriceCents(b))) : fetched;
  if (!query) {
    // Sin un orden elegido, primero lo que se puede comprar hoy (manteniendo destacados y nombre dentro de cada grupo).
    const inStock = (product: Product) => Number(product.variants.some((variant) => variant.totalStock > 0));
    return { products: filters.sort ? filtered : [...filtered].sort((a, b) => inStock(b) - inStock(a)), correctedQuery: null, searchIds: null };
  }
  const found = searchIds(catalog.map(productToSearchable), query);
  if (!found) return { products: filtered, correctedQuery: null, searchIds: null };
  const byId = new Map(filtered.map((product) => [product.id, product]));
  // Con un orden elegido (precio, stock) se respeta ese orden; si no, la relevancia de la búsqueda.
  const products = filters.sort
    ? filtered.filter((product) => found.ids.includes(product.id))
    : found.ids.flatMap((id) => byId.get(id) ?? []);
  return { products, correctedQuery: found.correctedQuery, searchIds: found.ids };
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const filters = await searchParams;
  const selected = Array.isArray(filters.category) ? filters.category[0] : filters.category;
  const current = selected ? (await getCategories()).find((category) => category.slug === selected) : undefined;
  const description = current
    ? `Compra ${current.name.toLowerCase()} para perros y gatos en Agrovet Mar del Plata. Stock por sucursal y compra online.`
    : "Compra alimentos, accesorios y farmacia para perros y gatos. Stock visible por sucursal en Mar del Plata.";
  // Cada categoría tiene su propia URL canónica; búsquedas, orden y demás filtros apuntan a su categoría o a /tienda.
  return {
    title: current?.name ?? "Tienda online",
    description,
    alternates: { canonical: current ? `/tienda?category=${encodeURIComponent(current.slug)}` : "/tienda" },
  };
}

export default async function StorePage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  // Un solo catálogo completo sirve para la búsqueda, las facetas y las sugerencias (antes lo traía getCatalogFacets).
  const [catalog, allCategories, allSubcategories, branches] = await Promise.all([getProducts(), getCategories(), getSubcategories(), getBranches()]);
  const { products, correctedQuery, searchIds: foundIds } = findProducts(filters, catalog, allCategories);
  const context = catalogContext(allCategories, foundIds);
  const facets = contextualFacets(catalog, filters, allCategories, context);
  const selectedCategories = list(filters.category);
  const selectedCategory = selectedCategories[0];
  const currentCategory = allCategories.find((item) => item.slug === selectedCategory);
  const selectedSubcategories = list(filters.subcategory);
  const selectedSubcategory = selectedSubcategories[0];
  // Árbol del panel de gestión (principal › interna › subcategorías) con contadores contextuales.
  const categoryTree = buildCategoryTree(allCategories, allSubcategories, facets, { categories: selectedCategories, subcategories: selectedSubcategories });
  // Ruta hasta lo elegido: la subcategoría si hay una, si no la categoría.
  const treePath = selectedSubcategory
    ? categoryTreePath(categoryTree, (node) => node.kind === "subcategory" && node.slug === selectedSubcategory)
    : selectedCategory ? categoryTreePath(categoryTree, (node) => node.kind === "category" && node.slug === selectedCategory) : [];
  const subcategoryProduct = selectedSubcategory ? catalog.find((product) => product.subcategorySlug === selectedSubcategory) : undefined;
  const currentSubcategory = selectedSubcategory
    ? treePath.at(-1)?.kind === "subcategory" ? treePath.at(-1) : subcategoryProduct ? { slug: subcategoryProduct.subcategorySlug, name: subcategoryProduct.subcategory } : undefined
    : undefined;
  const query = filters.q?.trim();
  const petTitle = filters.pet === "perro" ? "Productos para perros" : filters.pet === "gato" ? "Productos para gatos" : undefined;
  const title = currentSubcategory?.name ?? currentCategory?.name ?? (query ? `Resultados para “${correctedQuery ?? query}”` : petTitle ?? "Todos los productos");
  const showCorrection = Boolean(query && correctedQuery && !currentSubcategory && !currentCategory);
  // Ancestros del título, como links: "Tienda online › Perros › Alimento seco".
  const trail = treePath.slice(0, -1).filter((node) => node.kind === "category");

  // Filtros activos, cada uno con su link para quitarlo.
  const brandGroups = groupFacetValues(withSelected(facets.brands, list(filters.brand)));
  const stageGroups = groupFacetValues(withSelected(facets.lifeStages, list(filters.stage)), filterLabel);
  const sizeGroups = groupFacetValues(withSelected(facets.sizes, list(filters.size)), filterLabel)
    .map((group) => ({ ...group, count: group.count + facets.sizeAllCount }));
  const needGroups = groupFacetValues(withSelected(facets.needs, list(filters.need)), filterLabel);
  const categoryName = (slug: string) => allCategories.find((item) => item.slug === slug)?.name ?? filterLabel(slug);
  const subcategoryName = (slug: string) => allSubcategories.find((item) => item.slug === slug)?.name
    ?? catalog.find((product) => product.subcategorySlug === slug)?.subcategory ?? filterLabel(slug);
  const prices = facets.priceRange ?? { min: 0, max: 0 };
  const minPrice = Number(filters.minPrice);
  const maxPrice = Number(filters.maxPrice);
  const hasMin = Number.isFinite(minPrice) && filters.minPrice !== undefined && minPrice > prices.min;
  const hasMax = Number.isFinite(maxPrice) && filters.maxPrice !== undefined && maxPrice < prices.max;
  const activeFilters = [
    ...(query ? [{ label: `“${query}”`, href: withoutValue(filters, "q") }] : []),
    ...(filters.pet ? [{ label: filters.pet === "gato" ? "Gato" : "Perro", href: withoutValue(filters, "pet") }] : []),
    ...selectedCategories.map((slug) => ({ label: categoryName(slug), href: withoutValue(filters, "category", slug) })),
    ...list(filters.subcategory).map((slug) => ({ label: subcategoryName(slug), href: withoutValue(filters, "subcategory", slug) })),
    ...groupedPills(filters, "brand", brandGroups),
    ...groupedPills(filters, "stage", stageGroups),
    ...groupedPills(filters, "size", sizeGroups),
    ...groupedPills(filters, "need", needGroups),
    ...list(filters.presentation).map((value) => ({ label: value, href: withoutValue(filters, "presentation", value) })),
    ...(hasMin || hasMax ? [{
      label: hasMin && hasMax ? `${formatPrice(minPrice * 100)} a ${formatPrice(maxPrice * 100)}` : hasMin ? `Desde ${formatPrice(minPrice * 100)}` : `Hasta ${formatPrice(maxPrice * 100)}`,
      href: storeHref(filters, (params) => { params.delete("minPrice"); params.delete("maxPrice"); }),
    }] : []),
    ...(filters.stock === "disponible" ? [{ label: "Solo con stock", href: withoutValue(filters, "stock") }] : []),
  ];
  const clearAllHref = filters.sort ? `/tienda?sort=${encodeURIComponent(filters.sort)}` : "/tienda";
  const noFilters = activeFilters.length === 0;
  const onlyStock = filters.stock === "disponible";
  const stockToggleHref = onlyStock ? withoutValue(filters, "stock") : storeHref(filters, (params) => params.set("stock", "disponible"));

  // Sin resultados y con varios filtros: probamos sacar cada uno para sugerir cuál conviene quitar.
  // Se cuenta en memoria con el mismo criterio de las facetas (sin consultas extra).
  const suggestions = !products.length && activeFilters.length > 1
    ? activeFilters.slice(0, 8).map((item) => {
      const next = filtersFromHref(item.href);
      const nextContext = next.q?.trim() === query ? context : catalogContext(allCategories, null);
      return { ...item, count: catalog.filter((product) => productMatches(product, next, nextContext)).length };
    })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    : [];

  // Lo elegido que no quedó en el árbol (por ejemplo una categoría borrada) se conserva al aplicar el panel.
  const inTree = (kind: "category" | "subcategory", slug: string) => categoryTreePath(categoryTree, (node) => node.kind === kind && node.slug === slug).length > 0;
  const drawerFacets = {
    categoryTree,
    hiddenCategories: selectedCategories.filter((slug) => !inTree("category", slug)),
    hiddenSubcategories: selectedSubcategories.filter((slug) => !inTree("subcategory", slug)),
    species: facets.species,
    brands: brandGroups,
    lifeStages: stageGroups,
    sizes: sizeGroups,
    needs: needGroups,
    presentations: withSelected(facets.presentations, list(filters.presentation)),
    priceRange: facets.priceRange,
  };
  // Chips rápidos: solo categorías que hoy tienen productos en la tienda.
  const hasProducts = (slug: string) => catalog.some((product) => product.categorySlug === slug || context.parentOf.get(product.categorySlug) === slug);
  const quickCategories = [
    { slug: "perro-alimento-seco", label: "Seco perro" },
    { slug: "gato-alimento-seco", label: "Seco gato" },
    { slug: "perro-alimento-veterinario", label: "Veterinario perro" },
    { slug: "gato-alimento-veterinario", label: "Veterinario gato" },
  ].filter((item) => hasProducts(item.slug));

  const limit = Math.max(pageSize, Math.floor(Number(filters.ver) || pageSize));
  const visible = products.slice(0, limit);
  const remaining = products.length - visible.length;
  const moreHref = storeHref(filters, (params) => params.set("ver", String(limit + pageSize)));

  return (
    <>
      <div className="container shop-layout">
        <section>
          <div className="store-hero card">
            <div className="store-hero-copy">
              <p className="eyebrow store-trail">
                <Link href="/tienda">Tienda online</Link>
                {trail.map((node) => (
                  <span className="store-trail-step" key={node.slug}>
                    <ChevronRight aria-hidden="true" size={13} />
                    <Link href={`/tienda?category=${node.slug}`}>{node.name}</Link>
                  </span>
                ))}
              </p>
              <h1 className="display shop-title">{title}</h1>
              {showCorrection && <p className="store-correction">Buscaste “{query}”. Te mostramos resultados para “{correctedQuery}”.</p>}
              <p className="store-intro">Alimentos, accesorios y farmacia para perros y gatos, con el stock real de nuestras sucursales de Mar del Plata.</p>
              <p className="store-offer">Pagando en efectivo en sucursal tenés 10% de descuento en todos los productos.</p>
            </div>
            <div className="store-summary">
              <strong>{products.length}</strong>
              <span>{products.length === 1 ? "producto visible" : "productos visibles"}</span>
            </div>
          </div>
          <div className="store-chips">
            {/* La key rearma el panel cuando cambian los filtros (por ejemplo desde un chip), así nunca queda desactualizado. */}
            <StoreFilterDrawer facets={drawerFacets} filters={filters} key={storeHref(filters, () => undefined)} />
            <Link className={`chip ${noFilters ? "active" : ""}`} href="/tienda">Todas</Link>
            <Link className={`chip ${filters.pet === "perro" ? "active" : ""}`} href="/tienda?pet=perro">Perro</Link>
            <Link className={`chip ${filters.pet === "gato" ? "active" : ""}`} href="/tienda?pet=gato">Gato</Link>
            {quickCategories.map((item) => (
              <Link className={`chip ${selectedCategory === item.slug ? "active" : ""}`} href={`/tienda?category=${item.slug}`} key={item.slug}>{item.label}</Link>
            ))}
          </div>
          {activeFilters.length > 0 && (
            <div aria-label="Filtros activos" className="active-filters">
              {activeFilters.map((item) => (
                <Link aria-label={`Quitar filtro ${item.label}`} className="active-filter" href={item.href} key={item.href} scroll={false}>
                  <span>{item.label}</span>
                  <X aria-hidden="true" size={13} />
                </Link>
              ))}
              {activeFilters.length > 1 && <Link className="active-filters-clear" href={clearAllHref}>Limpiar todo</Link>}
            </div>
          )}
          <div className="results-header">
            <span><strong>{products.length}</strong> {products.length === 1 ? "producto encontrado" : "productos encontrados"}</span>
            <div className="results-tools">
              <Link aria-current={onlyStock ? "true" : undefined} className={`stock-toggle ${onlyStock ? "active" : ""}`} href={stockToggleHref} scroll={false}>
                <span aria-hidden="true" className="stock-toggle-dot" />
                Solo con stock
              </Link>
              <StoreSortSelect
                options={sortOptions.map((option) => ({ ...option, label: !option.value && query ? "Más relevantes" : option.label, href: storeHref(filters, (params) => (option.value ? params.set("sort", option.value) : params.delete("sort"))) }))}
                value={filters.sort ?? ""}
              />
            </div>
          </div>
          {products.length ? (
            <>
              <h2 className="sr-only">Productos</h2>
              <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
              <div className="store-more">
                <p>Mostrando {visible.length} de {products.length} productos</p>
                {remaining > 0 && (
                  <Link className="button button-light store-more-button" href={moreHref} scroll={false}>
                    Ver {Math.min(pageSize, remaining)} productos más
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="card empty">
              <span className="empty-icon" aria-hidden="true"><SearchX size={28} /></span>
              <h2 className="display">No encontramos productos</h2>
              <p>{query ? `No hay resultados para “${query}” con estos filtros.` : "No hay productos con estos filtros."} Probá quitar algún filtro de arriba o buscar otra marca.</p>
              {suggestions.length > 0 && (
                <ul className="empty-suggestions">
                  {suggestions.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>Quitar <strong>{item.label}</strong> <span>{item.count} {item.count === 1 ? "producto" : "productos"}</span></Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="empty-actions">
                {query && activeFilters.length > 1 && <Link className="button button-primary" href={`/tienda?q=${encodeURIComponent(query)}`}>Buscar “{query}” en todo el catálogo</Link>}
                {!noFilters && <Link className={`button ${query && activeFilters.length > 1 ? "button-light" : "button-primary"}`} href={clearAllHref}>Quitar todos los filtros</Link>}
                <Link className="button button-light" href="/tienda">Ver todo el catálogo</Link>
              </div>
            </div>
          )}
        </section>
      </div>
      <BranchesSection branches={branches} />
    </>
  );
}
