import { applyCashDiscount, formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { ProductArt } from "./product-art";
import { ProductCardCart } from "./product-card-cart";
import { ProductLink } from "./product-link";

export function ProductCard({ product }: { product: Product }) {
  const firstVariant = product.variants[0];
  if (!firstVariant) return null;
  const available = product.variants.filter((variant) => variant.totalStock > 0);
  const from = available.length ? Math.min(...available.map((variant) => variant.priceCents)) : firstVariant.priceCents;
  const cashPrice = applyCashDiscount(from);
  const total = product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
  return (
    <article className="card product-card">
      <ProductLink slug={product.slug}>
        <ProductArt product={product} />
      </ProductLink>
      <div className="product-body">
        <div className="product-meta">{product.category} / {product.subcategory}</div>
        <h3><ProductLink slug={product.slug}>{product.name}</ProductLink></h3>
        <div className="price">
          {formatPrice(from)}
          <small>{product.variants.length > 1 ? "Según presentación" : firstVariant.label}</small>
          <span className="price-cash">{formatPrice(cashPrice)}</span>
          <span className="price-cash-note">Con efectivo en sucursal: 10% de descuento</span>
        </div>
        <div className="product-flags">
          <span>{product.brand}</span>
          {product.lifeStage && <span>{product.lifeStage}</span>}
          {product.size && product.size !== "todos" && <span>{product.size}</span>}
        </div>
        <span className={`stock-label ${total === 0 ? "out" : ""}`}>
          {total === 0 ? "Sin stock" : total <= 3 ? "Últimas unidades" : "Disponible"}
        </span>
        <ProductCardCart product={product} />
        <ProductLink className="product-link" slug={product.slug}>Ver producto &rarr;</ProductLink>
      </div>
    </article>
  );
}
