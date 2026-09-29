"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const mainButtonRef = useRef<HTMLButtonElement | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  // La barra se monta en <body> (portal): dentro de la ficha, las animaciones con transform la anclarían al bloque y no a la pantalla.
  const [barMounted, setBarMounted] = useState(false);

  // Barra de compra fija en celular: aparece cuando el botón principal quedó arriba, fuera de la pantalla.
  useEffect(() => {
    const button = mainButtonRef.current;
    if (!button) return;
    const mobile = window.matchMedia("(max-width: 640px)");
    let passed = false;
    const sync = () => {
      const visible = passed && mobile.matches;
      setBarVisible(visible);
      // Mientras la barra se ve, el botón de WhatsApp se oculta para no taparla.
      if (visible) document.body.dataset.buyBar = "visible";
      else delete document.body.dataset.buyBar;
    };
    const observer = new IntersectionObserver(([entry]) => {
      setBarMounted(true);
      passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      sync();
    });
    observer.observe(button);
    mobile.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      mobile.removeEventListener("change", sync);
      delete document.body.dataset.buyBar;
    };
  }, []);

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
          <span className={`availability-row ${stock.quantity > 0 ? "in" : "out"}`} key={stock.branchId}><strong>{stock.branchName}</strong> <span>{stock.quantity > 0 ? `${stock.quantity} ${stock.quantity === 1 ? "disponible" : "disponibles"}` : "sin stock"}</span></span>
        ))}
      </div>
      <button className={`button button-primary detail-cart-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem} ref={mainButtonRef}>
        {added ? <Check size={18} /> : <ShoppingCart size={18} />} {added ? "Agregado" : variant.totalStock ? "Agregar al carrito" : "Sin stock"}
      </button>
      {barMounted && createPortal(
      <div aria-hidden={!barVisible} aria-label="Compra rápida" className={`buy-bar ${barVisible ? "visible" : ""}`} inert={!barVisible} role="region">
        <div className="buy-bar-info">
          <span>{variant.label}</span>
          <strong>{formatPrice(variant.priceCents)}</strong>
        </div>
        <button className={`button button-primary buy-bar-button ${added ? "added" : ""}`} disabled={variant.totalStock === 0} onClick={addItem} type="button">
          {added ? <Check size={17} /> : <ShoppingCart size={17} />} {added ? "Agregado" : variant.totalStock ? "Agregar" : "Sin stock"}
        </button>
      </div>,
      document.body,
      )}
    </div>
  );
}
