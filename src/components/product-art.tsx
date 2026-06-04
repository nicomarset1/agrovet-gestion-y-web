import Image from "next/image";

import type { Product } from "@/lib/types";

export function ProductArt({ product, detailed = false }: { product: Product; detailed?: boolean }) {
  return (
    <div className={detailed ? "detail-art" : "product-art"}>
      {!detailed && product.featured && <span className="product-badge">Destacado</span>}
      {product.imageUrl ? (
        <Image
          alt={`${product.brand} ${product.name}`}
          className="product-art-image"
          fill
          sizes={detailed ? "(max-width: 640px) 100vw, 720px" : "(max-width: 640px) 100vw, 360px"}
          src={product.imageUrl}
          unoptimized
        />
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
