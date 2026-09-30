"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, CircleAlert, Clock3, Lock, MessageCircle, Minus, PawPrint, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyCashDiscount, deliveryMinimumCents, formatPrice } from "@/lib/format";
import type { Branch } from "@/lib/types";
import { cartItemStockLimit, useCart } from "./cart-provider";

type CheckoutMessage = {
  text: string;
  title?: string;
  error?: boolean;
  code?: string;
  final?: boolean;
  finalStatus?: "success" | "pending" | "review";
  outsideCheckout?: boolean;
};

function getMercadoPagoReturn(params: URLSearchParams) {
  const explicitPayment = params.get("payment");
  const status = params.get("status") ?? params.get("collection_status");
  if (explicitPayment === "review") return "review";
  if (explicitPayment === "success" || status === "approved") return "success";
  if (explicitPayment === "pending" || status === "pending" || status === "in_process") return "pending";
  if (explicitPayment === "failure" || status === "rejected" || status === "cancelled") return "failure";
  return "";
}

// Miniatura del producto en el carrito; si no hay foto o no carga, queda la patita.
function CartLineThumb({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState("");
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <span className={`cart-line-thumb${showImage ? " has-image" : ""}`} aria-hidden="true">
      {showImage && src ? (
        <Image alt="" className="cart-line-thumb-image" fill onError={() => setFailedSrc(src)} sizes="56px" src={src} unoptimized />
      ) : <PawPrint size={22} />}
    </span>
  );
}

export function CartPage({ branches }: { branches: Branch[] }) {
  const { items, totalItems, totalCents, change, remove, clear } = useCart();
  const handledPaymentReturn = useRef(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? 0);
  const [fulfillment, setFulfillment] = useState<"retiro" | "envio">("retiro");
  const [paymentMethod, setPaymentMethod] = useState<"mercado_pago" | "efectivo">("mercado_pago");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState<{ distanceKm: number; deliveryAvailable: boolean; error?: string } | null>(null);
  const [message, setMessage] = useState<CheckoutMessage | null>(null);
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
  const cashTotalCents = applyCashDiscount(totalCents);
  const cashDiscountNote = "Pagando en efectivo en sucursal tenés 10% de descuento en todos los productos.";
  const effectivePaymentMethod = fulfillment === "envio" ? "mercado_pago" : paymentMethod;
  const showFinalMessage = Boolean(message?.final);
  const showCartMessage = Boolean(message?.outsideCheckout && !showFinalMessage);

  useEffect(() => {
    if (handledPaymentReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const payment = getMercadoPagoReturn(params);
    if (!payment) return;

    handledPaymentReturn.current = true;
    const timer = window.setTimeout(() => {
      const order = params.get("order") ?? params.get("external_reference") ?? undefined;
      if (payment === "success") {
        clear({ silent: true });
        setMessage({
          code: order,
          final: true,
          finalStatus: "success",
          title: "¡Compra realizada con éxito!",
          text: order
            ? `Tu pago fue aprobado y el pedido ${order} ya quedó confirmado.`
            : "Tu pago fue aprobado y el pedido ya quedó confirmado.",
        });
      } else if (payment === "pending") {
        clear({ silent: true });
        setMessage({
          code: order,
          final: true,
          finalStatus: "pending",
          title: "Pedido recibido",
          text: order
            ? `Recibimos el pedido ${order}, pero Mercado Pago todavía está procesando el pago. Te avisamos por WhatsApp cuando quede confirmado.`
            : "Recibimos tu pedido, pero Mercado Pago todavía está procesando el pago. Te avisamos por WhatsApp cuando quede confirmado.",
        });
      } else if (payment === "review") {
        clear({ silent: true });
        setMessage({
          code: order,
          final: true,
          finalStatus: "review",
          title: "Recibimos tu pago",
          text: order
            ? `Tu pago quedó acreditado y estamos revisando el pedido ${order} antes de confirmarlo. Te contactamos por WhatsApp a la brevedad.`
            : "Tu pago quedó acreditado y estamos revisando el pedido antes de confirmarlo. Te contactamos por WhatsApp a la brevedad.",
        });
      } else if (payment === "failure" && params.get("reason") === "abandoned") {
        setMessage({
          error: true,
          outsideCheckout: true,
          title: "No completaste el pago",
          text: "No se hizo ningún cobro. Tu carrito sigue guardado para que puedas revisar los datos e intentar nuevamente cuando quieras.",
        });
      } else if (payment === "failure") {
        setMessage({
          error: true,
          outsideCheckout: true,
          title: "No se completó el pago",
          text: "Mercado Pago rechazó o canceló el pago. Tu carrito sigue guardado para que puedas revisar los datos e intentar nuevamente.",
        });
      }
      window.history.replaceState(null, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clear]);

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
      setMessage({ text: "Para envío gratis necesitamos una dirección dentro de 3 km de la sucursal de Av. Independencia y Alberti.", error: true });
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
        paymentMethod: effectivePaymentMethod,
        address: fulfillment === "envio" ? address : "",
        distanceKm: fulfillment === "envio" ? zone?.distanceKm ?? null : null,
        branchId: effectiveBranchId,
        items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      }),
    });
    const result = await response.json() as { code?: string; error?: string; paymentUrl?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ text: result.error ?? "No se pudo crear el pedido.", error: true });
      return;
    }
    if (result.paymentUrl) {
      window.location.href = result.paymentUrl;
      return;
    }
    if (effectivePaymentMethod === "mercado_pago") {
      setMessage({ text: "No se pudo abrir Mercado Pago. Probá de nuevo en unos segundos.", error: true });
      return;
    }
    clear();
    setMessage({ code: result.code, text: `Pedido ${result.code} reservado. Te esperamos para abonar en efectivo en sucursal.` });
  }

  return (
    <div className={`container cart-page${showFinalMessage ? " cart-page-confirmed" : ""}`}>
      <section>
        {!showFinalMessage ? (
          <div className="cart-heading">
            <div>
              <p className="eyebrow">Tu compra</p>
              <h1 className="display">Carrito</h1>
            </div>
            {items.length > 0 ? (
              <span className="cart-heading-count">{totalItems} {totalItems === 1 ? "producto" : "productos"}</span>
            ) : null}
          </div>
        ) : null}
        {items.length > 0 && showCartMessage ? (
          <div className={`cart-alert${message?.error ? " is-error" : ""}`} role="alert">
            <span className="cart-alert-icon" aria-hidden="true"><CircleAlert size={20} /></span>
            <div>
              <h2>{message?.title}</h2>
              <p>{message?.text}</p>
            </div>
          </div>
        ) : null}
        {showFinalMessage ? (
          <div className={`order-confirmation ${message?.finalStatus === "success" ? "is-success" : "is-pending"}`}>
            <div className="order-confirmation-glow" aria-hidden="true" />
            <div className="order-confirmation-icon" aria-hidden="true">
              {message?.finalStatus === "success" ? <CheckCircle2 /> : <Clock3 />}
            </div>
            <p className="order-confirmation-kicker">
              {message?.finalStatus === "pending" ? "Pago en proceso" : message?.finalStatus === "review" ? "Pago recibido" : "Pago aprobado"}
            </p>
            <h1 className="display">{message?.title}</h1>
            <p className="order-confirmation-lead">{message?.text}</p>
            {message?.code ? (
              <div className="order-confirmation-code">
                <span>Número de pedido</span>
                <strong>{message.code}</strong>
              </div>
            ) : null}
            <div className="order-confirmation-steps">
              <div>
                <span><Check size={17} /></span>
                <p><strong>Pedido recibido</strong>Ya está registrado en Agrovet.</p>
              </div>
              <div>
                <span><MessageCircle size={17} /></span>
                <p><strong>Te contactamos</strong>Coordinamos retiro o entrega por WhatsApp.</p>
              </div>
            </div>
            <div className="order-confirmation-actions">
              <Link className="button button-primary" href="/tienda"><ShoppingBag size={17} /> Seguir comprando</Link>
              <Link className="button button-light" href="/">Volver al inicio</Link>
            </div>
            <p className="order-confirmation-thanks">Gracias por elegir Agrovet para cuidar a tus mascotas.</p>
          </div>
        ) : items.length === 0 && message ? (
          <div className={`card empty cart-empty${message?.error ? " is-error" : " is-success"}`}>
            <span className="cart-empty-icon" aria-hidden="true">{message?.error ? <CircleAlert /> : <CheckCircle2 />}</span>
            <h2>{message?.title ?? (message?.error ? "No se completó el pago" : "Pedido recibido")}</h2>
            <p>{message?.text}</p>
            <Link className="button button-primary" href="/tienda">Volver a la tienda <ArrowRight size={17} /></Link>
          </div>
        ) : items.length === 0 ? (
          <div className="card empty cart-empty">
            <span className="cart-empty-icon" aria-hidden="true"><ShoppingBag /></span>
            <h2>Tu carrito está vacío</h2>
            <p>Encontrá alimento, accesorios o farmacia para tu mascota.</p>
            <Link className="button button-primary" href="/tienda">Ir a la tienda <ArrowRight size={17} /></Link>
          </div>
        ) : (
          <div className="cart-lines">
            <h2 className="sr-only">Productos en el carrito</h2>
            {items.map((item, index) => (
              <article className="card cart-line" key={item.variantId} style={{ ["--i" as string]: Math.min(index, 8) }}>
                <CartLineThumb src={item.imageSrc} />
                <div className="cart-line-info">
                  <p className="cart-line-brand">{item.brand}</p>
                  <h3><Link href={`/producto/${item.productSlug}`}>{item.name}</Link></h3>
                  <small>Presentación: {item.label}</small>
                </div>
                <div className="cart-line-price">
                  <strong>{formatPrice(item.priceCents * item.quantity)}</strong>
                  {item.quantity > 1 ? <small>{formatPrice(item.priceCents)} c/u</small> : null}
                </div>
                <div className="qty">
                  <div className="qty-stepper" role="group" aria-label={`Cantidad de ${item.name}`}>
                    <button aria-label="Restar una unidad" className="qty-button" disabled={item.quantity <= 1} onClick={() => change(item.variantId, item.quantity - 1)} type="button"><Minus size={15} /></button>
                    <strong aria-live="polite">{item.quantity}</strong>
                    <button aria-label="Sumar una unidad" className="qty-button" disabled={item.quantity >= cartItemStockLimit(item)} onClick={() => change(item.variantId, item.quantity + 1)} title={item.quantity >= cartItemStockLimit(item) ? "No hay más stock" : undefined} type="button"><Plus size={15} /></button>
                  </div>
                  <button className="remove" onClick={() => remove(item.variantId)} type="button"><Trash2 size={14} /> Eliminar</button>
                </div>
                {item.quantity > cartItemStockLimit(item) ? (
                  <p className="cart-line-stock-warning" role="status">
                    {cartItemStockLimit(item) > 0
                      ? `Solo hay ${cartItemStockLimit(item)} ${cartItemStockLimit(item) === 1 ? "unidad disponible" : "unidades disponibles"}. Bajá la cantidad para poder finalizar el pedido.`
                      : "Este producto se quedó sin stock. Quitalo para poder finalizar el pedido."}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
      {items.length > 0 && !showFinalMessage && (
        <aside className="card checkout" id="checkout">
          <h2>Finalizar pedido</h2>
          {message && !message.outsideCheckout && <p className={`notice ${message.error ? "error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</p>}
          <form onSubmit={submit}>
            <p className="checkout-step">Tus datos</p>
            <input aria-label="Nombre y apellido" autoComplete="name" className="field" name="name" placeholder="Nombre y apellido" required />
            <input aria-label="WhatsApp" autoComplete="tel" className="field" inputMode="tel" name="phone" placeholder="WhatsApp" required type="tel" />
            <input aria-label="Email" autoComplete="email" className="field" name="email" placeholder="Email" type="email" required />
            <input name="fulfillment" type="hidden" value={fulfillment} />
            <input name="branchId" type="hidden" value={effectiveBranchId} />
            <fieldset className="checkout-fieldset">
            <legend className="checkout-step">Entrega</legend>
            <div className="choice-grid two">
              <button aria-pressed={fulfillment === "retiro"} className={`choice-card ${fulfillment === "retiro" ? "active" : ""}`} onClick={() => setFulfillment("retiro")} type="button">
                <strong>Retiro</strong>
                <span>Por sucursal</span>
              </button>
              <button
                aria-pressed={fulfillment === "envio"}
                className={`choice-card ${fulfillment === "envio" ? "active" : ""}`}
                disabled={belowDeliveryMinimum}
                onClick={() => setFulfillment("envio")}
                type="button"
              >
                <strong>Envío</strong>
                <span>Mar del Plata</span>
              </button>
            </div>
            </fieldset>
            <fieldset className="checkout-fieldset">
            <legend className="checkout-step">Pago</legend>
            <p className="notice cash-discount-notice">{cashDiscountNote}</p>
            <div className="choice-grid two">
              <button aria-pressed={effectivePaymentMethod === "mercado_pago"} className={`choice-card ${effectivePaymentMethod === "mercado_pago" ? "active" : ""}`} onClick={() => setPaymentMethod("mercado_pago")} type="button">
                <strong>Mercado Pago</strong>
                <span>Crédito, débito, saldo MP y cuotas</span>
              </button>
              <button
                aria-pressed={effectivePaymentMethod === "efectivo"}
                className={`choice-card ${effectivePaymentMethod === "efectivo" ? "active" : ""}`}
                disabled={fulfillment === "envio"}
                onClick={() => setPaymentMethod("efectivo")}
                type="button"
              >
                <strong>Efectivo</strong>
                <span>En sucursal con 10% de descuento</span>
              </button>
            </div>
            </fieldset>
            {fulfillment === "envio" && <p className="notice">Los pedidos con envío se abonan online con Mercado Pago antes de salir a reparto.</p>}
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
                <fieldset className="checkout-fieldset">
                  <legend className="checkout-step">Stock a reservar en</legend>
                  <div className="choice-grid">
                    {branches.map((branch) => (
                      <button aria-pressed={branchId === branch.id} className={`choice-card ${branchId === branch.id ? "active" : ""}`} key={branch.id} onClick={() => setBranchId(branch.id)} type="button">
                        <strong>{branch.name.replace("Sucursal ", "")}</strong>
                        <span>{branch.address}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {fulfillment === "envio" && (
              <div className="fulfillment-info">
                <strong>Envío en Mar del Plata</strong>
                <p>Gratis de lunes a sábados según zona, con compra mínima de {formatPrice(deliveryMinimumCents)} y dentro de 3 km de la sucursal de Av. Independencia y Alberti.</p>
              </div>
            )}
            {unavailable.length > 0 && <p className="notice error">Sin unidades suficientes en este local: {unavailable.map((item) => item.name).join(", ")}.</p>}
            <div className="checkout-total"><span>Total</span><span>{formatPrice(totalCents)}</span></div>
            {effectivePaymentMethod === "efectivo" && <div className="checkout-total-cash"><span>Total en efectivo</span><span>{formatPrice(cashTotalCents)}</span></div>}
            <button aria-busy={pending} className={`button button-primary checkout-submit${pending ? " is-pending" : ""}`} disabled={pending || unavailable.length > 0}>
              {pending ? <span className="loader-dot" aria-hidden="true" /> : effectivePaymentMethod === "mercado_pago" ? <Lock size={16} /> : <Check size={17} />}
              {pending ? "Procesando..." : effectivePaymentMethod === "mercado_pago" ? "Pagar con Mercado Pago" : "Reservar pedido"}
            </button>
            <Link className="button button-light" href="/tienda">Seguir comprando</Link>
            <p className="notice checkout-footnote">Te vamos a contactar por WhatsApp al número que ingresaste en la compra. Los medicamentos requieren asesoramiento cuando corresponda.</p>
          </form>
        </aside>
      )}
    </div>
  );
}
