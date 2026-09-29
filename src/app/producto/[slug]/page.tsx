import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductArt } from "@/components/product-art";
import { VariantSelector } from "@/components/variant-selector";
import { ProductCard } from "@/components/product-card";
import { getProduct, getProducts } from "@/lib/db";
import { productImageSrc } from "@/lib/product-image";
import { absoluteUrl, siteName } from "@/lib/site";

// URL absoluta de la foto para redes y buscadores: la ruta corta /api/product-image/... o la https tal cual.
// Sin foto, "" (el llamador usa el logo).
function publicImageUrl(product: Product) {
  const src = productImageSrc(product);
  return src.startsWith("/") ? absoluteUrl(src) : src;
}
import type { Product } from "@/lib/types";

function priceFrom(product: Product) {
  const available = product.variants.filter((variant) => variant.totalStock > 0);
  const pool = available.length ? available : product.variants;
  return pool.length ? Math.min(...pool.map((variant) => variant.priceCents)) : 0;
}

// "También te puede interesar": primero lo que tiene stock; dentro de cada grupo, la misma subcategoría
// y especie antes que el resto de la categoría. Usa getProducts con filtros existentes (solo trae esas filas).
async function relatedProducts(product: Product, count = 4) {
  const pet = product.species === "perro" || product.species === "gato" ? product.species : undefined;
  const [sameSubcategory, sameCategory] = await Promise.all([
    getProducts({ subcategory: product.subcategorySlug, pet }),
    product.categorySlug ? getProducts({ category: product.categorySlug, pet }) : Promise.resolve([]),
  ]);
  const seen = new Set([product.id]);
  const candidates = [...sameSubcategory, ...sameCategory].filter((item) => !seen.has(item.id) && seen.add(item.id));
  const hasStock = (item: Product) => Number(item.variants.some((variant) => variant.totalStock > 0));
  return candidates.sort((a, b) => hasStock(b) - hasStock(a)).slice(0, count);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Producto" };
  const description = `${product.brand} - ${product.name}. ${product.category} para mascotas en Agrovet Mar del Plata. Stock por sucursal y compra online.`;
  const canonical = `/producto/${product.slug}`;
  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${product.name} | ${product.brand}`,
      description,
      url: canonical,
      images: publicImageUrl(product)
        ? [{ url: publicImageUrl(product), alt: `${product.brand} ${product.name}` }]
        : [{ url: absoluteUrl("/agrovet-logo.png"), alt: siteName }],
    },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const [{ slug }, { back }] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  const backHref = back?.startsWith("/tienda") ? back : "/tienda";
  if (!product) notFound();
  const related = await relatedProducts(product);

  const totalStock = product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
  const productPrice = priceFrom(product);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category,
    image: publicImageUrl(product) ? [publicImageUrl(product)] : undefined,
    sku: product.variants[0]?.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "ARS",
      price: (productPrice / 100).toFixed(2),
      availability: totalStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absoluteUrl(`/producto/${product.slug}`),
      seller: { "@type": "Organization", name: siteName },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tienda", item: absoluteUrl("/tienda") },
      { "@type": "ListItem", position: 2, name: product.category, item: absoluteUrl(`/tienda?category=${product.categorySlug}`) },
      { "@type": "ListItem", position: 3, name: product.name, item: absoluteUrl(`/producto/${product.slug}`) },
    ],
  };

  return (
    <div className="container product-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <nav aria-label="Ruta de navegación" className="crumbs">
        <Link className="back-link" href={backHref}><ArrowLeft size={15} /> Volver a productos</Link>
        <span className="crumbs-trail">
          <Link href={`/tienda?category=${product.categorySlug}`}>{product.category}</Link>
          <ChevronRight aria-hidden="true" size={14} />
          <span aria-current="page">{product.name}</span>
        </span>
      </nav>
      <div className="product-detail">
        <ProductArt detailed product={product} />
        <section className="detail">
          <p className="eyebrow">{product.category} | {product.brand}</p>
          <h1 className="display">{product.name}</h1>
          <div className="store-chips detail-tags">
            <Link className="chip active" href={`/tienda?category=${product.categorySlug}`}>{product.category}</Link>
            <Link className="chip" href={`/tienda?category=${product.categorySlug}&subcategory=${product.subcategorySlug}`}>{product.subcategory}</Link>
            {product.lifeStage && <span className="chip">{product.lifeStage}</span>}
            {product.size && product.size !== "todos" && <span className="chip">{product.size}</span>}
            {product.need && <span className="chip">{product.need}</span>}
          </div>
          <p className="description">{product.description}</p>
          {product.requiresAdvice && <div className="advice"><Stethoscope aria-hidden="true" size={18} /><p><strong>Producto veterinario.</strong> Consultá indicaciones, dosificación y contraindicaciones con un profesional antes de administrarlo.</p></div>}
          <VariantSelector imageSrc={productImageSrc(product)} product={{ ...product, imageUrl: "", description: "" }} />
        </section>
      </div>
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="related-products">
          <h2 className="display" id="related-title">También te puede interesar</h2>
          <div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div>
        </section>
      )}
    </div>
  );
}
