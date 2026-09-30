"use client";

import { useMemo, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useCart } from "./cart-provider";
import { ProductLink } from "./product-link";

// Presentaciones visibles en la tarjeta; el resto se elige en la ficha ("+N más").
const maxCardVariants = 5;

// imageSrc viene calculado del servidor: acá el producto llega sin imageUrl para no inflar la página.
export function ProductCardCart({ imageSrc = "", product }: { imageSrc?: string; product: Product }) {
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
      imageSrc,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }

  // Si hay muchas, se muestran las primeras (siempre incluida la elegida) y un link a la ficha con el resto.
  const overflow = product.variants.length > maxCardVariants;
  const firstShown = overflow ? product.variants.slice(0, maxCardVariants - 1) : product.variants;
  const shown = overflow && !firstShown.some((item) => item.id === variant.id) ? [...firstShown.slice(0, -1), variant] : firstShown;
  const hidden = product.variants.length - shown.length;

  return (
    <div className={`card-cart-control ${product.variants.length > 1 ? "has-variants" : ""}`}>
      {product.variants.length > 1 ? (
        <div className="card-variant-options" role="group" aria-label={`Elegir presentación de ${product.name}`}>
          {shown.map((item) => (
            <button
              className={`variant-chip ${item.id === variant.id ? "active" : ""}`}
              disabled={item.totalStock === 0}
              key={item.id}
              onClick={() => {
                setVariantId(item.id);
                setAdded(false);
              }}
              aria-pressed={item.id === variant.id}
              aria-label={`${item.label}, ${formatPrice(item.priceCents)}${item.totalStock === 0 ? " (sin stock)" : ""}`}
              title={`${item.label} - ${formatPrice(item.priceCents)}`}
              type="button"
            >
              <span>{item.label}</span>
            </button>
          ))}
          {hidden > 0 && (
            <ProductLink className="variant-chip variant-chip-more" slug={product.slug}>
              <span aria-hidden="true">+{hidden} más</span>
              <span className="sr-only">Ver las {product.variants.length} presentaciones de {product.name}</span>
            </ProductLink>
          )}
        </div>
      ) : null}
      <button className={`card-cart-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem} aria-label={variant.totalStock ? `Agregar ${product.name} (${variant.label}) al carrito` : "Sin stock"} title={variant.totalStock ? "Agregar al carrito" : "Sin stock"} type="button">
        {added ? <Check size={18} /> : <ShoppingCart size={17} />}
        <span className="card-cart-text">{added ? "Agregado" : variant.totalStock ? "Agregar" : "Sin stock"}</span>
      </button>
    </div>
  );
}
