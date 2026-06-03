import Link from "next/link";
import { BranchesSection } from "@/components/branches-section";
import { ProductCard } from "@/components/product-card";
import { StoreFilterDrawer } from "@/components/store-filter-drawer";
import { getBranches, getCatalogFacets, getProducts } from "@/lib/db";

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

export const metadata = { title: "Tienda online" };

export default async function StorePage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  const products = getProducts(filters);
  const facets = getCatalogFacets();
  const branches = getBranches();
  const selectedCategory = Array.isArray(filters.category) ? filters.category[0] : filters.category;
  const currentCategory = facets.categories.find((item) => item.slug === selectedCategory);

  return (
    <>
      <div className="container shop-layout">
        <section>
        <div className="store-hero card">
          <div>
            <p className="eyebrow">Tienda online</p>
            <h1 className="display shop-title">{currentCategory?.name ?? "Todos los productos"}</h1>
            <p className="store-intro">Búsqueda por marca, especie, subcategoría, presentación, precio y stock. Los filtros se abren desde un panel lateral para no tapar el catálogo.</p>
          </div>
          <div className="store-summary">
            <strong>{products.length}</strong>
            <span>productos visibles</span>
          </div>
        </div>
        <div className="store-chips">
          <StoreFilterDrawer facets={facets} filters={filters} />
          <Link className={`chip ${!filters.category && !filters.pet ? "active" : ""}`} href="/tienda">Todas</Link>
          <Link className={`chip ${filters.pet === "perro" ? "active" : ""}`} href="/tienda?pet=perro">Perro</Link>
          <Link className={`chip ${filters.pet === "gato" ? "active" : ""}`} href="/tienda?pet=gato">Gato</Link>
          <Link className={`chip ${selectedCategory === "alimentos" ? "active" : ""}`} href="/tienda?category=alimentos">Alimentos</Link>
          <Link className={`chip ${selectedCategory === "farmacia" ? "active" : ""}`} href="/tienda?category=farmacia">Farmacia</Link>
          <Link className={`chip ${selectedCategory === "accesorios" ? "active" : ""}`} href="/tienda?category=accesorios">Accesorios</Link>
          <Link className={`chip ${selectedCategory === "higiene" ? "active" : ""}`} href="/tienda?category=higiene">Higiene</Link>
        </div>
        <div className="results-header"><span>{products.length} productos encontrados</span><span>Stock actualizado por sucursal</span></div>
        {products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div> : (
          <div className="card empty"><h2>No encontramos productos</h2><p>Probá quitar filtros o buscar otra marca.</p><Link className="button button-primary" href="/tienda">Ver catálogo</Link></div>
        )}
        </section>
      </div>
      <BranchesSection branches={branches} />
    </>
  );
}
