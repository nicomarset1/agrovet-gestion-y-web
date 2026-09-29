import { applyCashDiscount, formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { productImageSrc } from "@/lib/product-image";
import { cardPriceCents } from "./catalog-labels";
import { ProductArt } from "./product-art";
import { ProductCardCart } from "./product-card-cart";
import { ProductLink } from "./product-link";

export function ProductCard({ product }: { product: Product }) {
  const firstVariant = product.variants[0];
  if (!firstVariant) return null;
  const from = cardPriceCents(product);
  const cashPrice = applyCashDiscount(from);
  const total = product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
  const stockState = total === 0 ? "out" : total <= 3 ? "low" : "in";
  return (
    <article className={`card product-card ${stockState === "out" ? "is-out" : ""}`}>
      <ProductLink className="product-card-media" slug={product.slug}>
        <ProductArt product={product} />
      </ProductLink>
      <div className="product-body">
        <div className="product-meta" title={`${product.category} / ${product.subcategory}`}>{product.category} / {product.subcategory}</div>
        <h3 title={product.name}><ProductLink slug={product.slug}>{product.name}</ProductLink></h3>
        <div className="price">
          <span className="price-main">{formatPrice(from)}</span>
          <small>{product.variants.length > 1 ? "Según presentación" : firstVariant.label}</small>
          <span className="price-cash">
            <span className="price-cash-badge">-10%</span>
            {formatPrice(cashPrice)}
            <span className="price-cash-note">en efectivo en sucursal</span>
          </span>
        </div>
        <div className="product-flags">
          <span>{product.brand}</span>
          {product.lifeStage && <span>{product.lifeStage}</span>}
          {product.size && product.size !== "todos" && <span>{product.size}</span>}
        </div>
        <div className="product-card-foot">
          {/* Sin foto ni descripción: el componente de cliente no las usa y así no viajan de nuevo en la página. */}
          <ProductCardCart imageSrc={productImageSrc(product)} product={{ ...product, imageUrl: "", description: "" }} />
          <div className="product-card-status">
            <span className={`stock-label ${stockState}`}>
              {total === 0 ? "Sin stock" : total <= 3 ? "Últimas unidades" : "Disponible"}
            </span>
            <ProductLink className="product-link" slug={product.slug}>Ver producto &rarr;</ProductLink>
          </div>
        </div>
      </div>
    </article>
  );
}
