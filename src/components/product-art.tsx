import type { Product } from "@/lib/types";
import { productImageSrc } from "@/lib/product-image";
import { ProductArtImage } from "./product-art-image";

export function ProductArt({ product, detailed = false }: { product: Product; detailed?: boolean }) {
  const pack = (
    <div className="pack" style={{ background: product.color }}>
      <span className="pack-brand">{product.brand}</span>
      <span className="pack-name">{product.name}</span>
      <span className="pack-line" />
    </div>
  );
  const imageSrc = productImageSrc(product);
  return (
    <div className={detailed ? "detail-art" : "product-art"}>
      {!detailed && product.featured && <span className="product-badge">Destacado</span>}
      {imageSrc ? (
        <ProductArtImage
          alt={`${product.brand} ${product.name}`}
          fallback={pack}
          sizes={detailed ? "(max-width: 640px) 100vw, 720px" : "(max-width: 640px) 50vw, 360px"}
          src={imageSrc}
        />
      ) : pack}
    </div>
  );
}
