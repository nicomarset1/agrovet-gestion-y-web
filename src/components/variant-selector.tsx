"use client";

import { useMemo, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useCart } from "./cart-provider";

export function VariantSelector({ product }: { product: Product }) {
  const firstAvailable = product.variants.find((variant) => variant.totalStock > 0) ?? product.variants[0] ?? null;
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? 0);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const variant = useMemo(() => product.variants.find((item) => item.id === variantId) ?? firstAvailable, [firstAvailable, product.variants, variantId]);
  if (!variant) return null;

  function addItem() {
    add({
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      brand: product.brand,
      label: variant.label,
      priceCents: variant.priceCents,
      stocks: variant.stocks,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }

  return (
    <div className="card variant-box">
      <span className="variant-label">Presentación</span>
      <div className="detail-variant-options">
        {product.variants.map((item) => (
          <button
            className={`detail-variant-chip ${item.id === variant.id ? "active" : ""}`}
            disabled={item.totalStock === 0}
            key={item.id}
            onClick={() => { setVariantId(item.id); setAdded(false); }}
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{formatPrice(item.priceCents)}</span>
          </button>
        ))}
      </div>
      <div className="variant-price">{formatPrice(variant.priceCents)}</div>
      <div className="availability">
        {variant.stocks.map((stock) => (
          <span key={stock.branchId}><strong>{stock.branchName}:</strong> {stock.quantity > 0 ? `${stock.quantity} disponibles` : "sin stock"}</span>
        ))}
      </div>
      <button className={`button button-primary detail-cart-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem} style={{ width: "100%" }}>
        {added ? <Check size={18} /> : <ShoppingCart size={18} />} {added ? "Agregado" : variant.totalStock ? "Agregar al carrito" : "Sin stock"}
      </button>
    </div>
  );
}
