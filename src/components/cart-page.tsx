"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Branch } from "@/lib/types";
import { useCart } from "./cart-provider";

const deliveryMinimumCents = 5000000;

export function CartPage({ branches }: { branches: Branch[] }) {
  const { items, totalCents, change, remove, clear } = useCart();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? 0);
  const [fulfillment, setFulfillment] = useState<"retiro" | "envio">("retiro");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState<{ distanceKm: number; deliveryAvailable: boolean; error?: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean; code?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [checkingZone, setCheckingZone] = useState(false);
  const deliveryBranchId = useMemo(() => {
    const ranked = branches.map((branch) => {
      const totalStock = items.reduce((sum, item) => sum + (item.stocks.find((entry) => entry.branchId === branch.id)?.quantity ?? 0), 0);
      return { branchId: branch.id, totalStock };
    });
    ranked.sort((a, b) => b.totalStock - a.totalStock || a.branchId - b.branchId);
    return ranked[0]?.branchId ?? branches[0]?.id ?? 0;
  }, [branches, items]);
  const effectiveBranchId = fulfillment === "envio" ? deliveryBranchId : branchId;
  const unavailable = useMemo(() => items.filter((item) => {
    const stock = fulfillment === "envio"
      ? item.stocks.reduce((sum, entry) => sum + entry.quantity, 0)
      : item.stocks.find((entry) => entry.branchId === effectiveBranchId)?.quantity ?? 0;
    return stock < item.quantity;
  }), [effectiveBranchId, fulfillment, items]);
  const belowDeliveryMinimum = totalCents < deliveryMinimumCents;
  const cashDiscountNote = "Pagando en efectivo en sucursal tenés 10% de descuento en todos los productos.";

  async function checkZone(value: string) {
    setAddress(value);
    setZone(null);
    if (value.trim().length < 6) return;
    setCheckingZone(true);
    const response = await fetch("/api/delivery-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: value }),
    });
    const result = await response.json() as { distanceKm?: number; deliveryAvailable?: boolean; error?: string };
    setCheckingZone(false);
    if (!response.ok) {
      setZone({ distanceKm: 0, deliveryAvailable: false, error: result.error ?? "No pudimos verificar la dirección." });
      return;
    }
    setZone({ distanceKm: result.distanceKm ?? 0, deliveryAvailable: Boolean(result.deliveryAvailable) });
    if (!result.deliveryAvailable) setFulfillment("retiro");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fulfillment === "envio" && (!address.trim() || !zone || !zone.deliveryAvailable)) {
      setMessage({ text: "Para envío gratis necesitamos una dirección dentro de 3 km de Alberti 3213.", error: true });
      return;
    }
    if (fulfillment === "envio" && belowDeliveryMinimum) {
      setMessage({ text: `El envío requiere una compra mínima de ${formatPrice(deliveryMinimumCents)}. Para este pedido corresponde retiro por sucursal.`, error: true });
      setFulfillment("retiro");
      return;
    }
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        fulfillment,
        source: "Tienda online",
        address: fulfillment === "envio" ? address : "",
        distanceKm: fulfillment === "envio" ? zone?.distanceKm ?? null : null,
        branchId: effectiveBranchId,
        items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      }),
    });
    const result = await response.json() as { code?: string; error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ text: result.error ?? "No se pudo crear el pedido.", error: true });
      return;
    }
    clear();
    setMessage({ code: result.code, text: `Pedido ${result.code} reservado. Agrovet confirmará pago y entrega por WhatsApp.` });
  }

  return (
    <div className="container cart-page">
      <section>
        <p className="eyebrow">Tu compra</p>
        <h1 className="display">Carrito</h1>
        {items.length === 0 && !message ? (
          <div className="card empty"><h2>Tu carrito está vacío</h2><p>Encontrá alimento, accesorios o farmacia para tu mascota.</p><Link className="button button-primary" href="/tienda">Ir a la tienda</Link></div>
        ) : items.map((item) => (
          <article className="card cart-line" key={item.variantId}>
            <div>
              <h3>{item.brand} {item.name}</h3>
              <small>Presentación: {item.label}</small>
              <div className="qty">
                <button className="qty-button" onClick={() => change(item.variantId, item.quantity - 1)} type="button">-</button>
                <strong>{item.quantity}</strong>
                <button className="qty-button" onClick={() => change(item.variantId, item.quantity + 1)} type="button">+</button>
                <button className="remove" onClick={() => remove(item.variantId)} type="button">Eliminar</button>
              </div>
            </div>
            <strong>{formatPrice(item.priceCents * item.quantity)}</strong>
          </article>
        ))}
      </section>
      {items.length > 0 && (
        <aside className="card checkout">
          <h2>Finalizar pedido</h2>
          {message && <p className={`notice ${message.error ? "error" : ""}`}>{message.text}</p>}
          <form onSubmit={submit}>
            <input className="field" name="name" placeholder="Nombre y apellido" required />
            <input className="field" name="phone" placeholder="WhatsApp" required />
            <input className="field" name="email" placeholder="Email" type="email" required />
            <input name="fulfillment" type="hidden" value={fulfillment} />
            <input name="branchId" type="hidden" value={effectiveBranchId} />
            <div className="choice-grid two">
              <button className={`choice-card ${fulfillment === "retiro" ? "active" : ""}`} onClick={() => setFulfillment("retiro")} type="button">
                <strong>Retiro</strong>
                <span>Por sucursal</span>
              </button>
              <button
                className={`choice-card ${fulfillment === "envio" ? "active" : ""}`}
                disabled={belowDeliveryMinimum}
                onClick={() => setFulfillment("envio")}
                type="button"
              >
                <strong>Envío</strong>
                <span>Mar del Plata</span>
              </button>
            </div>
            <p className="notice cash-discount-notice">{cashDiscountNote}</p>
            {fulfillment === "retiro" && <p className="notice cash-discount-notice">Si abonás en efectivo en sucursal, aplicamos 10% de descuento en todos los productos.</p>}
            {belowDeliveryMinimum && <p className="notice error">El envío se habilita desde {formatPrice(deliveryMinimumCents)}. Con este total, el pedido es solo retiro por sucursal.</p>}
            {fulfillment === "envio" && (
              <>
                <input
                  className="field"
                  name="address"
                  onBlur={(event) => checkZone(event.target.value)}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Dirección en Mar del Plata"
                  required
                  value={address}
                />
                {checkingZone && <p className="notice loading-notice"><span className="loader-dot" /> Verificando zona de entrega...</p>}
                {zone && !zone.error && (
                  <p className={`notice ${zone.deliveryAvailable ? "" : "error"}`}>
                    Distancia estimada: {zone.distanceKm} km. {zone.deliveryAvailable ? "Puede ir con envío gratis." : "Corresponde retiro por sucursal."}
                  </p>
                )}
                {zone?.error && <p className="notice error">{zone.error}</p>}
              </>
            )}
            {fulfillment === "retiro" && (
              <>
                <div className="fulfillment-info">
                  <strong>Retiro en sucursal</strong>
                  <p>En tan solo 2 horas tu pedido estará listo para retirar en la sucursal seleccionada. Los pedidos permanecen en sucursal durante 3 días hábiles; si necesitás más tiempo, comunicate con nosotros.</p>
                </div>
                <label>Stock a reservar en</label>
                <div className="choice-grid">
                  {branches.map((branch) => (
                    <button className={`choice-card ${branchId === branch.id ? "active" : ""}`} key={branch.id} onClick={() => setBranchId(branch.id)} type="button">
                      <strong>{branch.name.replace("Sucursal ", "")}</strong>
                      <span>{branch.address}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {fulfillment === "envio" && (
              <div className="fulfillment-info">
                <strong>Envío en Mar del Plata</strong>
                <p>Gratis de lunes a sábados según zona, con compra mínima de {formatPrice(deliveryMinimumCents)} y dentro de 3 km de Alberti 3213.</p>
              </div>
            )}
            {unavailable.length > 0 && <p className="notice error">Sin unidades suficientes en este local: {unavailable.map((item) => item.name).join(", ")}.</p>}
            <div className="checkout-total"><span>Total</span><span>{formatPrice(totalCents)}</span></div>
            <button className="button button-primary" disabled={pending || unavailable.length > 0}>{pending ? "Reservando..." : "Confirmar pedido"}</button>
            <p className="notice">El pago y la entrega se confirman con el local. Te vamos a contactar por WhatsApp al número que ingresaste en la compra. Los medicamentos requieren asesoramiento cuando corresponda.</p>
          </form>
        </aside>
      )}
    </div>
  );
}
