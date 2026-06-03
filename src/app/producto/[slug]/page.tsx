import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductArt } from "@/components/product-art";
import { VariantSelector } from "@/components/variant-selector";
import { getProduct } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return { title: product?.name ?? "Producto" };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ back?: string }> }) {
  const [{ slug }, { back }] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  const backHref = back?.startsWith("/tienda") ? back : "/tienda";
  if (!product) notFound();
  return (
    <div className="container product-page">
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
