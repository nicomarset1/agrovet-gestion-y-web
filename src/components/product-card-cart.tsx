"use client";

import { useMemo, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useCart } from "./cart-provider";

export function ProductCardCart({ product }: { product: Product }) {
  const firstAvailable = product.variants.find((variant) => variant.totalStock > 0) ?? product.variants[0] ?? null;
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? 0);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const variant = useMemo(
    () => product.variants.find((item) => item.id === variantId) ?? firstAvailable,
    [firstAvailable, product.variants, variantId],
  );
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
    <div className="card-cart-control">
      {product.variants.length > 1 ? (
        <div className="card-variant-options" aria-label={`Elegir presentación de ${product.name}`}>
          {product.variants.map((item) => (
            <button
              className={`variant-chip ${item.id === variant.id ? "active" : ""}`}
              disabled={item.totalStock === 0}
              key={item.id}
              onClick={() => {
                setVariantId(item.id);
                setAdded(false);
              }}
              title={`${item.label} - ${formatPrice(item.priceCents)}`}
              type="button"
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button className={`card-cart-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem} title={variant.totalStock ? "Agregar al carrito" : "Sin stock"} type="button">
        {added ? <Check size={18} /> : <ShoppingCart size={17} />}
      </button>
    </div>
  );
}
