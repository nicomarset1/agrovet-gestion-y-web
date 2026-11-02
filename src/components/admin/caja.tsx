"use client";

// Panel de gestión: sección Caja (venta de mostrador).

import { useRouter } from "next/navigation";
import { Minus, PackagePlus, Pencil, Plus, RotateCcw, ScanBarcode, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, installmentsLabel, posMaxUnitPriceCents, posUnitPriceCents } from "@/lib/format";
import { Switch } from "@/components/ui/form-controls";
import { Select } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatRange } from "@/components/ui/date-utils";
import type { Branch, OrderRecord, Product } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import { closePosSaleAction } from "@/app/gestion-agrovet/actions";
import { INSTALLMENT_OPTIONS, PAYMENT_OPTIONS, SectionHeader, dateKey, formatAdminDateTime, isCancelledOrder, isCashOrder, toDate } from "@/components/admin/shared";

// Acepta como se escribe un precio acá: 25000, 25.000, 25.000,50 o $ 25000. Vacío = volver al de lista.
function parsePosPrice(raw: string): number | "empty" | "invalid" {
  const value = raw.replace(/[$\s]/g, "");
  if (!value) return "empty";
  const plain = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value)
    ? value.replace(/\./g, "").replace(",", ".")
    : /^\d+([.,]\d{1,2})?$/.test(value)
      ? value.replace(",", ".")
      : null;
  if (!plain) return "invalid";
  const cents = Math.round(Number(plain) * 100);
  return cents > 0 && cents <= posMaxUnitPriceCents ? cents : "invalid";
}

function formatPriceInput(cents: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(cents / 100);
}

function PosPriceField({
  listCents,
  manualCents,
  name,
  onChange,
  onCloseSale,
  onDone,
  onDraftInvalid,
  onInvalid,
  onScan,
}: {
  listCents: number;
  manualCents: number | null;
  name: string;
  onChange: (manualCents: number | null) => void;
  onCloseSale: () => void;
  onDone: () => void;
  onDraftInvalid: (invalid: boolean) => void;
  onInvalid: (text: string) => void;
  onScan: (code: string) => void;
}) {
  // null = no se está editando: se muestra el precio vigente de la línea.
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parsePosPrice(draft) === "invalid";
  const stopEditing = () => {
    setDraft(null);
    onDraftInvalid(false);
  };
  // Devuelve si quedó bien: un precio mal escrito no se aplica y la línea sigue con el que tenía.
  function commit() {
    if (draft === null) return true;
    const parsed = parsePosPrice(draft);
    stopEditing();
    if (parsed === "invalid") {
      onInvalid(`"${draft}" no es un precio válido. Se dejó ${formatPrice(manualCents ?? listCents)}.`);
      return false;
    }
    onChange(parsed === "empty" || parsed === listCents ? null : parsed);
    return true;
  }
  return (
    <div className={`admin-pos-price${manualCents !== null ? " is-manual" : ""}${invalid ? " is-invalid" : ""}`}>
      <span aria-hidden="true">$</span>
      <input
        aria-invalid={invalid}
        aria-label={`Precio por unidad de ${name}`}
        autoComplete="off"
        inputMode="decimal"
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.target.value);
          onDraftInvalid(parsePosPrice(event.target.value) === "invalid");
        }}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            // Se aplica el precio antes de cerrar; el atajo general de la Caja no debe cerrar con el anterior.
            event.preventDefault();
            event.stopPropagation();
            if (commit()) onCloseSale();
          } else if (event.key === "Enter") {
            event.preventDefault();
            // Si pasan el lector con el foco acá entra un código: se agrega el producto y el precio no se toca.
            const typed = draft?.trim() ?? "";
            if (/^\d{8,}$/.test(typed)) {
              stopEditing();
              onScan(typed);
            } else {
              commit();
            }
            onDone();
          } else if (event.key === "Escape") {
            event.preventDefault();
            stopEditing();
            onDone();
          }
        }}
        type="text"
        value={draft ?? formatPriceInput(manualCents ?? listCents)}
      />
      {manualCents !== null ? (
        <button
          aria-label={`Volver al precio de lista, ${formatPrice(listCents)}`}
          className="admin-pos-price-reset"
          onClick={() => { onChange(null); onDone(); }}
          title={`Volver a ${formatPrice(listCents)}`}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={13} />
        </button>
      ) : null}
    </div>
  );
}

function PointOfSalePanel({
  branch,
  orders,
  onDeleteOrder,
  onEditOrder,
  products,
}: {
  branch: Branch;
  orders: OrderRecord[];
  onDeleteOrder: (order: OrderRecord) => void;
  onEditOrder: (order: OrderRecord) => void;
  products: Product[];
}) {
  const router = useRouter();
  const { push } = useToast();
  // priceCents es el precio de lista; manualPriceCents, el escrito a mano solo para esta venta.
  type PosLine = { variantId: number; productName: string; brand: string; label: string; sku: string; barcode: string; quantity: number; priceCents: number; manualPriceCents: number | null; stock: number };
  const [scanValue, setScanValue] = useState("");
  const [cart, setCart] = useState<PosLine[]>([]);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [flash, setFlash] = useState<{ variantId: number; tick: number } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const focusScan = () => requestAnimationFrame(() => scanRef.current?.focus());
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [installments, setInstallments] = useState("1");
  // El 10% de efectivo arranca aplicado, como promete la tienda; se puede sacar venta por venta.
  const [cashDiscountOn, setCashDiscountOn] = useState(true);
  const [priceDraftInvalid, setPriceDraftInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDaySales, setShowDaySales] = useState(false);
  const catalogVariants = useMemo(() => products.flatMap((product) => product.variants.map((variant) => ({
    variantId: variant.id,
    productName: product.name,
    brand: product.brand,
    label: variant.label,
    sku: variant.sku,
    barcode: variant.barcode || variant.sku,
    priceCents: variant.priceCents,
    stock: variant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0,
  }))), [branch.id, products]);
  // Ventas del día por defecto; se puede elegir otro día o un rango.
  const todayKey = dateKey(new Date());
  const [salesRange, setSalesRange] = useState<{ from: string; to: string } | null>(null);
  const salesFrom = salesRange?.from ?? todayKey;
  const salesTo = salesRange?.to ?? todayKey;
  const isTodayRange = salesFrom === todayKey && salesTo === todayKey;
  const todaySales = useMemo(() => orders.filter((order) => {
    if (isCancelledOrder(order) || !isCashOrder(order) || order.branchId !== branch.id) return false;
    const key = dateKey(toDate(order.createdAt));
    return key >= salesFrom && key <= salesTo;
  }), [branch.id, orders, salesFrom, salesTo]);
  const isCashPayment = paymentMethod === "Efectivo";
  const discountActive = isCashPayment && cashDiscountOn;
  // Las líneas muestran el precio sin el 10%; el descuento se ve aparte en el resumen, como en un ticket.
  const subtotalCents = cart.reduce((sum, item) => sum + (item.manualPriceCents ?? item.priceCents) * item.quantity, 0);
  const totalCents = cart.reduce((sum, item) => sum + posUnitPriceCents(item.priceCents, { manualCents: item.manualPriceCents, cashDiscount: discountActive }) * item.quantity, 0);
  const discountCents = subtotalCents - totalCents;
  const hasManualPrice = cart.some((item) => item.manualPriceCents !== null);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  function pushVariant(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const compact = value.replace(/\s+/g, "");
    const match = catalogVariants.find((variant) => [variant.barcode, variant.sku, variant.barcode.replace(/\s+/g, ""), variant.sku.replace(/\s+/g, "")].includes(value) || [variant.barcode.replace(/\s+/g, ""), variant.sku.replace(/\s+/g, ""), variant.label].includes(compact));
    if (!match) {
      setNotice({ text: `No se encontró un producto con el código "${value}".`, tone: "error" });
      return;
    }
    const existing = cart.find((item) => item.variantId === match.variantId);
    if ((existing?.quantity ?? 0) >= match.stock) {
      setNotice({ text: `No queda stock de ${match.brand} ${match.productName} ${match.label} en ${branch.name}.`, tone: "error" });
      return;
    }
    setNotice({ text: `${match.brand} ${match.productName} ${match.label} agregado.`, tone: "ok" });
    setFlash((current) => ({ variantId: match.variantId, tick: (current?.tick ?? 0) + 1 }));
    setCart((current) => (existing
      ? current.map((item) => (item.variantId === match.variantId ? { ...item, quantity: item.quantity + 1 } : item))
      : [...current, { ...match, quantity: 1, manualPriceCents: null }]));
  }
  function setLinePrice(variantId: number, manualPriceCents: number | null) {
    setCart((current) => current.map((item) => (item.variantId === variantId ? { ...item, manualPriceCents } : item)));
  }
  // Suma una unidad sin pasar el stock de la sucursal (antes se podía y la venta fallaba al cerrar).
  function increaseLine(variantId: number) {
    const line = cart.find((item) => item.variantId === variantId);
    if (line && line.quantity >= line.stock) {
      setNotice({ text: `No hay más stock de ${line.brand} ${line.productName} ${line.label} en ${branch.name}.`, tone: "error" });
      return;
    }
    setCart((current) => current.map((item) => (item.variantId === variantId ? { ...item, quantity: item.quantity + 1 } : item)));
  }
  function decreaseLine(variantId: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.variantId !== variantId) return [item];
      if (item.quantity <= 1) return [];
      return [{ ...item, quantity: item.quantity - 1 }];
    }));
  }
  function removeLine(variantId: number) {
    setCart((current) => current.filter((item) => item.variantId !== variantId));
  }
  async function closeSale() {
    if (!cart.length || submitting || priceDraftInvalid) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await closePosSaleAction({
        branchId: branch.id,
        paymentMethod,
        installments: paymentMethod === "Tarjeta" ? installments : undefined,
        cashDiscount: discountActive,
        items: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          ...(item.manualPriceCents !== null ? { manualPriceCents: item.manualPriceCents } : {}),
        })),
      });
      if (!result.ok) throw new Error(result.error);
      setCart([]);
      setScanValue("");
      setCashDiscountOn(true);
      setNotice({ text: `Venta cerrada: ${result.code} por ${formatPrice(result.totalCents)}.`, tone: "ok" });
      push({ title: "Venta cerrada", message: `${result.code} · ${formatPrice(result.totalCents)}`, type: "success" });
      setShowDaySales(true);
      router.refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudo cerrar la venta.", tone: "error" });
    } finally {
      setSubmitting(false);
      focusScan();
    }
  }
  // Atajo: Ctrl+Enter (o Cmd+Enter) cierra la venta desde cualquier lugar de la Caja.
  const closeSaleRef = useRef(closeSale);
  useEffect(() => {
    closeSaleRef.current = closeSale;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
      if (document.querySelector(".admin-modal-backdrop")) return;
      event.preventDefault();
      void closeSaleRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const paymentSummary = paymentMethod === "Tarjeta" ? `Tarjeta · ${installmentsLabel(installments)}` : paymentMethod;
  return (
    <div className="admin-point-grid">
      <section className="card admin-panel admin-pos-main">
        <div className="admin-pos-top">
          <div className="admin-point-field admin-pos-scan">
            <label htmlFor="caja-scan">Código de barras o SKU</label>
            <div className="admin-scan-row">
              <span className="admin-pos-scan-field">
                <ScanBarcode aria-hidden="true" size={18} />
                <input
                  autoComplete="off"
                  autoFocus
                  className="field"
                  id="caja-scan"
                  onChange={(event) => setScanValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !(event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      pushVariant(scanValue);
                      setScanValue("");
                    } else if (event.key === "Escape" && scanValue) {
                      event.preventDefault();
                      setScanValue("");
                    }
                  }}
                  placeholder="Escaneá o escribí el código"
                  ref={scanRef}
                  value={scanValue}
                />
              </span>
              <button aria-label="Agregar producto" className="button button-primary" onClick={() => { pushVariant(scanValue); setScanValue(""); focusScan(); }} type="button"><PackagePlus size={18} /></button>
            </div>
          </div>
          <label className="admin-pos-payment">
            <span id="caja-medio-de-pago">Medio de pago</span>
            <Select ariaLabelledBy="caja-medio-de-pago" onChange={(value) => { setPaymentMethod(value); focusScan(); }} options={PAYMENT_OPTIONS} value={paymentMethod} />
          </label>
          {paymentMethod === "Tarjeta" ? (
            <label className="admin-pos-installments">
              <span id="caja-cuotas">Cuotas</span>
              <Select ariaLabelledBy="caja-cuotas" onChange={(value) => { setInstallments(value); focusScan(); }} options={INSTALLMENT_OPTIONS} value={installments} />
            </label>
          ) : null}
        </div>
        <p className="admin-pos-keys"><kbd>Enter</kbd> agrega · <kbd>Esc</kbd> limpia el campo · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> cierra la venta · Tocá un precio para cambiarlo</p>
        {notice ? (
          <p className={`admin-pos-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>
        ) : null}
        <div className="admin-pos-cart">
          {cart.length ? (
            <ul className="admin-pos-lines">
              {cart.map((item) => (
                <li
                  className={`admin-pos-line${flash?.variantId === item.variantId ? " is-flash" : ""}`}
                  key={flash?.variantId === item.variantId ? `${item.variantId}-${flash.tick}` : item.variantId}
                >
                  <div className="admin-pos-line-copy">
                    <strong>{item.brand} {item.productName}</strong>
                    <small>{item.label} · {item.barcode}{item.manualPriceCents !== null ? ` · lista ${formatPrice(item.priceCents)}` : ""}</small>
                  </div>
                  <PosPriceField
                    listCents={item.priceCents}
                    manualCents={item.manualPriceCents}
                    name={item.productName}
                    onChange={(manualCents) => setLinePrice(item.variantId, manualCents)}
                    onCloseSale={() => requestAnimationFrame(() => void closeSaleRef.current())}
                    onDone={focusScan}
                    onDraftInvalid={setPriceDraftInvalid}
                    onInvalid={(text) => setNotice({ text, tone: "error" })}
                    onScan={pushVariant}
                  />
                  <div className="admin-pos-qty" role="group" aria-label={`Cantidad de ${item.productName}`}>
                    <button aria-label="Restar una unidad" className="qty-button" onClick={() => { decreaseLine(item.variantId); focusScan(); }} type="button"><Minus size={14} /></button>
                    <span aria-live="polite">{item.quantity}</span>
                    <button aria-label="Sumar una unidad" className="qty-button" disabled={item.quantity >= item.stock} onClick={() => { increaseLine(item.variantId); focusScan(); }} type="button"><Plus size={14} /></button>
                  </div>
                  <strong className="admin-pos-subtotal">{formatPrice((item.manualPriceCents ?? item.priceCents) * item.quantity)}</strong>
                  <button aria-label={`Quitar ${item.productName} de la venta`} className="icon-button danger" onClick={() => { removeLine(item.variantId); focusScan(); }} type="button"><X size={15} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-empty-state">
              <ScanBarcode size={40} />
              <strong>La venta está vacía</strong>
              <span>Escaneá un código de barras para empezar</span>
            </div>
          )}
        </div>
      </section>
      <aside className="card admin-panel admin-pos-summary" aria-label="Resumen de venta">
        <small className="admin-pos-summary-label">Total a cobrar</small>
        <strong className="admin-pos-total">{formatPrice(totalCents)}</strong>
        <p className="admin-pos-summary-meta">
          {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"} · {cart.length} {cart.length === 1 ? "producto" : "productos"} · {paymentSummary}
        </p>
        <div className={`admin-pos-reveal${isCashPayment ? " is-open" : ""}`} inert={!isCashPayment}>
          <div>
            <div className="admin-pos-cash">
              <Switch
                checked={cashDiscountOn}
                label="Descuento efectivo 10%"
                onChange={(event) => { setCashDiscountOn(event.target.checked); focusScan(); }}
              />
              <div className={`admin-pos-reveal${discountCents > 0 ? " is-open" : ""}`}>
                <div>
                  <dl className="admin-pos-breakdown">
                    <div><dt>Subtotal</dt><dd>{formatPrice(subtotalCents)}</dd></div>
                    <div className="is-discount"><dt>Descuento</dt><dd>−{formatPrice(discountCents)}</dd></div>
                  </dl>
                </div>
              </div>
              <div className={`admin-pos-reveal${discountActive && hasManualPrice ? " is-open" : ""}`}>
                <div>
                  <small className="admin-pos-cash-note">Los precios escritos a mano no llevan el 10%.</small>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-point-actions">
          <button className="button button-primary admin-pos-close" disabled={!cart.length || submitting || priceDraftInvalid} onClick={closeSale} type="button">
            {submitting ? "Cerrando…" : "Cerrar venta"}
          </button>
          <button className="button button-light" disabled={!cart.length || submitting} onClick={() => { setCart([]); setNotice(null); setCashDiscountOn(true); setPriceDraftInvalid(false); focusScan(); }} type="button">Vaciar venta</button>
        </div>
        <div className="admin-point-sales-head">
          <button className="button button-light" onClick={() => setShowDaySales((current) => !current)} type="button">
            {showDaySales ? "Ocultar ventas del día" : "Ver ventas del día"}
          </button>
          <small>{todaySales.length} {todaySales.length === 1 ? "venta" : "ventas"} {isTodayRange ? "hoy" : formatRange(salesFrom, salesTo)}</small>
        </div>
        {showDaySales ? (
          <DateRangePicker
            ariaLabel="Día o rango de ventas de caja"
            className="admin-caja-range"
            from={salesFrom}
            max={todayKey}
            onChange={(from, to) => setSalesRange(from && to ? { from, to } : null)}
            to={salesTo}
          />
        ) : null}
        {showDaySales ? (
          <div className="admin-sale-list admin-sale-list-compact">
            {todaySales.length ? todaySales.map((order) => (
              <div className="admin-table-row compact" key={order.id}>
                <div>
                  <strong>{order.code}</strong>
                  <small>{formatPrice(order.totalCents)} | {formatAdminDateTime(order.createdAt, { timeStyle: "short" })} | {order.status}</small>
                </div>
                <div className="admin-row-actions">
                  <button aria-label={`Editar venta ${order.code}`} className="icon-button" onClick={() => onEditOrder(order)} type="button"><Pencil size={16} /></button>
                  <button aria-label={`Eliminar venta ${order.code}`} className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )) : <p className="description">No hay ventas de caja {isTodayRange ? "hoy" : `entre ${formatRange(salesFrom, salesTo)}`} en esta sucursal.</p>}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function CajaSection({
  branch,
  onDeleteOrder,
  onEditOrder,
  orders,
  products,
}: {
  branch: Branch;
  onDeleteOrder: (order: OrderRecord) => void;
  onEditOrder: (order: OrderRecord) => void;
  orders: OrderRecord[];
  products: Product[];
}) {
  return (
    <>
    <div id="admin-section-punto-venta">
    <SectionHeader subtitle={`Ventas de mostrador en ${branch.name}: escaneá, elegí el medio de pago y cerrá la venta`} title="Caja" />
    <PointOfSalePanel branch={branch} onDeleteOrder={onDeleteOrder} onEditOrder={onEditOrder} orders={orders} products={products} />
    </div>
    </>
  );
}
