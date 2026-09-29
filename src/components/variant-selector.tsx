"use client";

import { useMemo, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { applyCashDiscount, formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { useCart } from "./cart-provider";

// imageSrc viene calculado del servidor: acá el producto llega sin imageUrl para no inflar la página.
export function VariantSelector({ imageSrc = "", product }: { imageSrc?: string; product: Product }) {
  const firstAvailable = product.variants.find((variant) => variant.totalStock > 0) ?? product.variants[0] ?? null;
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? 0);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const variant = useMemo(() => product.variants.find((item) => item.id === variantId) ?? firstAvailable, [firstAvailable, product.variants, variantId]);
  if (!variant) return null;
  const cashPrice = applyCashDiscount(variant.priceCents);

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

  return (
    <div className="card variant-box">
      <span className="variant-label" id="variant-label">Presentación</span>
      <div className="detail-variant-options" role="group" aria-labelledby="variant-label">
        {product.variants.map((item) => (
          <button
            className={`detail-variant-chip ${item.id === variant.id ? "active" : ""}`}
            disabled={item.totalStock === 0}
            key={item.id}
            onClick={() => { setVariantId(item.id); setAdded(false); }}
            aria-pressed={item.id === variant.id}
            aria-label={`${item.label}, ${formatPrice(item.priceCents)}${item.totalStock === 0 ? " (sin stock)" : ""}`}
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{formatPrice(item.priceCents)}</span>
            {item.totalStock === 0 && <small className="detail-variant-out">Sin stock</small>}
          </button>
        ))}
      </div>
      <div className="variant-pricing" key={variant.id}>
        <div className="variant-price">{formatPrice(variant.priceCents)}</div>
        <div className="variant-cash">
          <span className="price-cash-badge">-10%</span>
          <span className="variant-cash-price">{formatPrice(cashPrice)}</span>
          <span className="variant-cash-note">Con efectivo en sucursal: 10% de descuento</span>
        </div>
      </div>
      <div className="availability">
        <span className="availability-title">Stock por sucursal</span>
        {variant.stocks.map((stock) => (
          <span className={`availability-row ${stock.quantity > 0 ? "in" : "out"}`} key={stock.branchId}><strong>{stock.branchName}</strong> <span>{stock.quantity > 0 ? `${stock.quantity} disponibles` : "sin stock"}</span></span>
        ))}
      </div>
      <button className={`button button-primary detail-cart-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem}>
        {added ? <Check size={18} /> : <ShoppingCart size={18} />} {added ? "Agregado" : variant.totalStock ? "Agregar al carrito" : "Sin stock"}
      </button>
    </div>
  );
}
