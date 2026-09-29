import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { BranchesSection } from "@/components/branches-section";
import { ProductCard } from "@/components/product-card";
import { StoreFilterDrawer } from "@/components/store-filter-drawer";
import { getBranches, getCatalogFacets, getCategories, getProducts } from "@/lib/db";

type Search = Promise<{
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
}>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const filters = await searchParams;
  const selected = Array.isArray(filters.category) ? filters.category[0] : filters.category;
  const current = selected ? (await getCategories()).find((category) => category.slug === selected) : undefined;
  const description = current
    ? `Compra ${current.name.toLowerCase()} para perros y gatos en Agrovet Mar del Plata. Stock por sucursal y compra online.`
    : "Compra alimentos, accesorios y farmacia para perros y gatos. Stock visible por sucursal en Mar del Plata.";
  return {
    title: current?.name ?? "Tienda online",
    description,
    alternates: { canonical: "/tienda" },
  };
}

export default async function StorePage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  const [products, facets, branches] = await Promise.all([getProducts(filters), getCatalogFacets(), getBranches()]);
  const selectedCategory = Array.isArray(filters.category) ? filters.category[0] : filters.category;
  const currentCategory = facets.categories.find((item) => item.slug === selectedCategory);
  const query = filters.q?.trim();
  const title = currentCategory?.name ?? (query ? `Resultados para “${query}”` : "Todos los productos");

  return (
    <>
      <div className="container shop-layout">
        <section>
          <div className="store-hero card">
            <div className="store-hero-copy">
              <p className="eyebrow">Tienda online</p>
              <h1 className="display shop-title">{title}</h1>
              <p className="store-intro">Alimentos, accesorios y farmacia para perros y gatos, con el stock real de nuestras sucursales de Mar del Plata.</p>
              <p className="store-offer">Pagando en efectivo en sucursal tenés 10% de descuento en todos los productos.</p>
            </div>
            <div className="store-summary">
              <strong>{products.length}</strong>
              <span>{products.length === 1 ? "producto visible" : "productos visibles"}</span>
            </div>
          </div>
          <div className="store-chips">
            <StoreFilterDrawer facets={facets} filters={filters} />
            <Link className={`chip ${!filters.category && !filters.pet ? "active" : ""}`} href="/tienda">Todas</Link>
            <Link className={`chip ${filters.pet === "perro" ? "active" : ""}`} href="/tienda?pet=perro">Perro</Link>
            <Link className={`chip ${filters.pet === "gato" ? "active" : ""}`} href="/tienda?pet=gato">Gato</Link>
            <Link className={`chip ${selectedCategory === "perro-alimento-seco" ? "active" : ""}`} href="/tienda?category=perro-alimento-seco">Seco perro</Link>
            <Link className={`chip ${selectedCategory === "gato-alimento-seco" ? "active" : ""}`} href="/tienda?category=gato-alimento-seco">Seco gato</Link>
            <Link className={`chip ${selectedCategory === "perro-alimento-veterinario" ? "active" : ""}`} href="/tienda?category=perro-alimento-veterinario">Veterinario perro</Link>
            <Link className={`chip ${selectedCategory === "gato-alimento-veterinario" ? "active" : ""}`} href="/tienda?category=gato-alimento-veterinario">Veterinario gato</Link>
          </div>
          <div className="results-header">
            <span><strong>{products.length}</strong> {products.length === 1 ? "producto encontrado" : "productos encontrados"}</span>
            <span className="results-live">Stock actualizado por sucursal</span>
          </div>
          {products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : (
            <div className="card empty">
              <span className="empty-icon" aria-hidden="true"><SearchX size={28} /></span>
              <h2 className="display">No encontramos productos</h2>
              <p>{query ? `No hay resultados para “${query}” con estos filtros.` : "No hay productos con estos filtros."} Probá quitar algún filtro o buscar otra marca.</p>
              <Link className="button button-primary" href="/tienda">Ver todo el catálogo</Link>
            </div>
          )}
        </section>
      </div>
      <BranchesSection branches={branches} />
    </>
  );
}
