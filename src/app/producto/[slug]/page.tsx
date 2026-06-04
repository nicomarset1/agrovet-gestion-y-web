import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductArt } from "@/components/product-art";
import { VariantSelector } from "@/components/variant-selector";
import { getProduct } from "@/lib/db";
import { absoluteUrl, siteName } from "@/lib/site";
import type { Product } from "@/lib/types";

function priceFrom(product: Product) {
  const available = product.variants.filter((variant) => variant.totalStock > 0);
  const pool = available.length ? available : product.variants;
  return pool.length ? Math.min(...pool.map((variant) => variant.priceCents)) : 0;
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
      images: product.imageUrl ? [{ url: product.imageUrl, alt: `${product.brand} ${product.name}` }] : undefined,
    },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const [{ slug }, { back }] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  const backHref = back?.startsWith("/tienda") ? back : "/tienda";
  if (!product) notFound();

  const totalStock = product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    sku: product.variants[0]?.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "ARS",
      price: (priceFrom(product) / 100).toFixed(2),
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
      <div className="crumbs"><Link className="back-link" href={backHref}>&larr; Volver a productos</Link> / <Link href={`/tienda?category=${product.categorySlug}`}>{product.category}</Link> / {product.name}</div>
      <div className="product-detail">
        <ProductArt detailed product={product} />
        <section className="detail">
          <p className="eyebrow">{product.category} | {product.brand}</p>
          <h1 className="display">{product.name}</h1>
          <div className="store-chips" style={{ marginBottom: "14px" }}>
            <Link className="chip active" href={`/tienda?category=${product.categorySlug}`}>{product.category}</Link>
            <Link className="chip" href={`/tienda?subcategory=${product.subcategorySlug}`}>{product.subcategory}</Link>
            {product.lifeStage && <span className="chip">{product.lifeStage}</span>}
            {product.size && product.size !== "todos" && <span className="chip">{product.size}</span>}
            {product.need && <span className="chip">{product.need}</span>}
          </div>
          <p className="description">{product.description}</p>
          {product.requiresAdvice && <div className="advice"><strong>Producto veterinario.</strong> Consultá indicaciones, dosificación y contraindicaciones con un profesional antes de administrarlo.</div>}
          <VariantSelector product={product} />
        </section>
      </div>
    </div>
  );
}
