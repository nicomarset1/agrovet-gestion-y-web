import type { Product } from "@/lib/types";

export function ProductArt({ product, detailed = false }: { product: Product; detailed?: boolean }) {
  return (
    <div className={detailed ? "detail-art" : "product-art"}>
      {!detailed && product.featured && <span className="product-badge">Destacado</span>}
      {product.imageUrl ? (
        <img alt={product.name} className="product-art-image" src={product.imageUrl} />
      ) : (
        <div className="pack" style={{ background: product.color }}>
          <span className="pack-brand">{product.brand}</span>
          <span className="pack-name">{product.name}</span>
          <span className="pack-line" />
        </div>
      )}
    </div>
  );
}
