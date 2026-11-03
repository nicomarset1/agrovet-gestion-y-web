"use client";

// Panel de gestión: sección Caja (venta de mostrador).

import { useRouter } from "next/navigation";
import { Minus, PackagePlus, Pencil, Plus, RotateCcw, ScanBarcode, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cajaStorageKey, matchVariantsByCode, restoreCajaSale } from "@/lib/caja";
import type { PosExtra, PosLine } from "@/lib/caja";
import { extrasTotalCents, formatPrice, installmentsLabel, posMaxUnitPriceCents, posUnitPriceCents } from "@/lib/format";
import { Switch } from "@/components/ui/form-controls";
import { Select } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatRange } from "@/components/ui/date-utils";
import type { Branch, OrderRecord, Product } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import { closePosSaleAction } from "@/app/gestion-agrovet/actions";
import { INSTALLMENT_OPTIONS, PAYMENT_OPTIONS, SectionHeader, dateKey, formatAdminDateTime, isCancelledOrder, isCashOrder, toDate } from "@/components/admin/shared";
import { VariantPicker } from "@/components/admin/variant-picker";

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
  const [scanValue, setScanValue] = useState("");
  const [cart, setCart] = useState<PosLine[]>([]);
  // "Varios": renglones libres con descripción y monto, sin producto ni stock.
  const [extras, setExtras] = useState<PosExtra[]>([]);
  const nextExtraId = useRef(1);
  const [extraFormOpen, setExtraFormOpen] = useState(false);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const extraDescriptionRef = useRef<HTMLInputElement>(null);
  const extraAmountRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [flash, setFlash] = useState<{ variantId: number; tick: number } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  // Con el selector de presentación abierto, el foco queda en él: lo devuelve al cerrarse.
  const focusScan = () => requestAnimationFrame(() => {
    if (!document.querySelector(".admin-variant-picker")) scanRef.current?.focus();
  });
  // Código que coincide con más de una presentación, a la espera de que el cajero elija.
  const [codeChoice, setCodeChoice] = useState<{ code: string; variantIds: number[] } | null>(null);
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
  const catalogById = useMemo(() => new Map(catalogVariants.map((variant) => [variant.variantId, variant])), [catalogVariants]);
  // El carrito guarda el precio con el que se agregó el renglón. Lo que se muestra y se cobra (lista y stock) sale
  // siempre del catálogo, que LiveSync mantiene al día: si cambia con la venta abierta, se ve acá.
  const lines = useMemo(() => cart.map((item) => {
    const live = catalogById.get(item.variantId);
    return { ...item, ...(live ?? { stock: 0 }), addedPriceCents: item.priceCents, gone: !live };
  }), [cart, catalogById]);
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
  const subtotalCents = extrasTotalCents(extras) + lines.reduce((sum, item) => sum + (item.manualPriceCents ?? item.priceCents) * item.quantity, 0);
  const totalCents = extras.reduce((sum, extra) => sum + posUnitPriceCents(extra.amountCents, { cashDiscount: discountActive }), 0)
    + lines.reduce((sum, item) => sum + posUnitPriceCents(item.priceCents, { manualCents: item.manualPriceCents, cashDiscount: discountActive }) * item.quantity, 0);
  const discountCents = subtotalCents - totalCents;
  const hasManualPrice = lines.some((item) => item.manualPriceCents !== null);
  const totalUnits = extras.length + lines.reduce((sum, item) => sum + item.quantity, 0);
  const lineCount = cart.length + extras.length;
  // La venta en curso sobrevive a un refresco o a volver a entrar por sesión vencida. Se lee en un efecto y no
  // en el estado inicial: el HTML del servidor siempre trae la venta vacía y tiene que coincidir al hidratar.
  const storageKey = cajaStorageKey(branch.id);
  const restoreDone = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restoreDone.current) return;
    restoreDone.current = true;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(storageKey);
    } catch {
      // Sin almacenamiento, la venta dura hasta recargar.
    }
    const sale = restoreCajaSale(stored, new Set(catalogVariants.map((variant) => variant.variantId)));
    queueMicrotask(() => {
      if (sale) {
        setCart(sale.cart);
        setExtras(sale.extras);
        setPaymentMethod(sale.paymentMethod);
        setInstallments(sale.installments);
        setCashDiscountOn(sale.cashDiscountOn);
        nextExtraId.current = Math.max(0, ...sale.extras.map((extra) => extra.id)) + 1;
        setNotice({
          text: sale.dropped
            ? `Se recuperó la venta en curso. Se quitó ${sale.dropped === 1 ? "1 producto que ya no existe" : `${sale.dropped} productos que ya no existen`}.`
            : "Se recuperó la venta en curso.",
          tone: "ok",
        });
      }
      setRestored(true);
    });
  }, [catalogVariants, storageKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (cart.length || extras.length) window.sessionStorage.setItem(storageKey, JSON.stringify({ cart, extras, paymentMethod, installments, cashDiscountOn }));
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // Sin almacenamiento, la venta dura hasta recargar.
    }
  }, [cart, cashDiscountOn, extras, installments, paymentMethod, restored, storageKey]);
  function closeExtraForm() {
    setExtraFormOpen(false);
    setExtraDescription("");
    setExtraAmount("");
  }
  function openExtraForm() {
    setExtraFormOpen(true);
    requestAnimationFrame(() => extraDescriptionRef.current?.focus());
  }
  // Devuelve si se agregó. Sin descripción queda como "Varios"; el monto es lo único obligatorio.
  function addExtra() {
    const amountCents = parsePosPrice(extraAmount);
    if (typeof amountCents !== "number") {
      setNotice({ text: extraAmount.trim() ? `"${extraAmount.trim()}" no es un monto válido.` : "Escribí el monto de varios.", tone: "error" });
      extraAmountRef.current?.focus();
      return false;
    }
    if (extras.length >= 20) {
      setNotice({ text: "Se pueden agregar hasta 20 renglones de varios por venta.", tone: "error" });
      return false;
    }
    const description = extraDescription.trim() || "Varios";
    const id = nextExtraId.current++;
    setExtras((current) => [...current, { id, description, amountCents }]);
    setNotice({ text: `${description} por ${formatPrice(amountCents)} agregado.`, tone: "ok" });
    closeExtraForm();
    focusScan();
    return true;
  }
  function onExtraFormKeyDown(event: React.KeyboardEvent, field: "description" | "amount") {
    if (event.key === "Escape") {
      event.preventDefault();
      closeExtraForm();
      focusScan();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      // Lo escrito se suma antes de cerrar; el atajo general de la Caja cerraría sin esto.
      event.preventDefault();
      event.stopPropagation();
      if (addExtra()) requestAnimationFrame(() => void closeSaleRef.current());
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (field === "description" && !extraAmount.trim()) extraAmountRef.current?.focus();
      else addExtra();
    }
  }
  function pushVariant(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const compact = value.replace(/\s+/g, "");
    const byCode = matchVariantsByCode(catalogVariants, value);
    const matches = byCode.length ? byCode : catalogVariants.filter((variant) => variant.label === compact);
    if (!matches.length) {
      setNotice({ text: `No se encontró un producto con el código "${value}".`, tone: "error" });
      return;
    }
    if (matches.length > 1) {
      setNotice(null);
      setCodeChoice({ code: value, variantIds: matches.map((variant) => variant.variantId) });
      return;
    }
    addVariant(matches[0]);
  }
  function addVariant(match: (typeof catalogVariants)[number]) {
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
    const line = lines.find((item) => item.variantId === variantId);
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
    if (submitting || priceDraftInvalid) return;
    // Lo escrito sin agregar no se pierde en silencio: el cliente se iría sin ese producto y sin pagarlo.
    if (scanValue.trim()) {
      setNotice({ text: `El código "${scanValue.trim()}" está escrito pero no se agregó. Apretá Enter para sumarlo o borralo antes de cerrar.`, tone: "error" });
      scanRef.current?.focus();
      return;
    }
    if (extraFormOpen && extraAmount.trim()) {
      setNotice({ text: "Quedó un Varios a medio cargar. Apretá Enter para sumarlo o Esc para descartarlo antes de cerrar.", tone: "error" });
      extraAmountRef.current?.focus();
      return;
    }
    if (!lineCount) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await closePosSaleAction({
        branchId: branch.id,
        paymentMethod,
        installments: paymentMethod === "Tarjeta" ? installments : undefined,
        cashDiscount: discountActive,
        items: lines.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          ...(item.manualPriceCents !== null ? { manualPriceCents: item.manualPriceCents } : { expectedPriceCents: item.priceCents }),
        })),
        extras: extras.map(({ description, amountCents }) => ({ description, amountCents })),
      });
      if (!result.ok) throw new Error(result.error);
      setCart([]);
      setExtras([]);
      setScanValue("");
      setCashDiscountOn(true);
      setNotice({ text: `Venta cerrada: ${result.code} por ${formatPrice(result.totalCents)}.`, tone: "ok" });
      push({ title: "Venta cerrada", message: `${result.code} · ${formatPrice(result.totalCents)}`, type: "success" });
      setShowDaySales(true);
      router.refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudo cerrar la venta.", tone: "error" });
      // Si fue por un precio o un stock que cambió, la pantalla tiene que mostrar el dato nuevo sin esperar a LiveSync.
      router.refresh();
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
          {lineCount ? (
            <ul className="admin-pos-lines">
              {lines.map((item) => (
                <li
                  className={`admin-pos-line${flash?.variantId === item.variantId ? " is-flash" : ""}`}
                  key={flash?.variantId === item.variantId ? `${item.variantId}-${flash.tick}` : item.variantId}
                >
                  <div className="admin-pos-line-copy">
                    <strong>{item.brand} {item.productName}</strong>
                    <small>{item.label} · {item.barcode}{item.manualPriceCents !== null ? ` · lista ${formatPrice(item.priceCents)}` : ""}</small>
                    {item.gone ? <small className="admin-pos-line-alert">Ya no está en el catálogo: quitalo para cerrar la venta.</small> : null}
                    {!item.gone && item.quantity > item.stock ? <small className="admin-pos-line-alert">{item.stock > 0 ? `Solo quedan ${item.stock} en ${branch.name}.` : `No queda stock en ${branch.name}.`}</small> : null}
                    {!item.gone && item.manualPriceCents === null && item.addedPriceCents !== item.priceCents ? <small className="admin-pos-line-alert">Precio actualizado: antes {formatPrice(item.addedPriceCents)}.</small> : null}
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
              {extras.map((extra) => (
                <li className="admin-pos-line is-extra is-flash" key={`extra-${extra.id}`}>
                  <div className="admin-pos-line-copy">
                    <strong>{extra.description}</strong>
                    <small>Varios · sin stock</small>
                  </div>
                  <PosPriceField
                    listCents={extra.amountCents}
                    manualCents={null}
                    name={extra.description}
                    onChange={(amountCents) => {
                      if (amountCents !== null) setExtras((current) => current.map((item) => (item.id === extra.id ? { ...item, amountCents } : item)));
                    }}
                    onCloseSale={() => requestAnimationFrame(() => void closeSaleRef.current())}
                    onDone={focusScan}
                    onDraftInvalid={setPriceDraftInvalid}
                    onInvalid={(text) => setNotice({ text, tone: "error" })}
                    onScan={pushVariant}
                  />
                  <span aria-hidden="true" className="admin-pos-qty-spacer" />
                  <strong className="admin-pos-subtotal">{formatPrice(extra.amountCents)}</strong>
                  <button aria-label={`Quitar ${extra.description} de la venta`} className="icon-button danger" onClick={() => { setExtras((current) => current.filter((item) => item.id !== extra.id)); focusScan(); }} type="button"><X size={15} /></button>
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
          <div className="admin-pos-extra">
            <div className={`admin-pos-reveal${extraFormOpen ? "" : " is-open"}`} inert={extraFormOpen}>
              <div>
                <button className="button button-light admin-pos-extra-open" onClick={openExtraForm} type="button"><Plus size={15} /> Agregar varios</button>
              </div>
            </div>
            <div className={`admin-pos-reveal${extraFormOpen ? " is-open" : ""}`} inert={!extraFormOpen}>
              <div>
                <div className="admin-pos-extra-form" role="group" aria-label="Agregar varios">
                  <label>
                    <span>Descripción</span>
                    <input
                      autoComplete="off"
                      className="field"
                      maxLength={80}
                      onChange={(event) => setExtraDescription(event.target.value)}
                      onKeyDown={(event) => onExtraFormKeyDown(event, "description")}
                      placeholder="Varios"
                      ref={extraDescriptionRef}
                      type="text"
                      value={extraDescription}
                    />
                  </label>
                  <label>
                    <span>Monto</span>
                    <input
                      autoComplete="off"
                      className="field"
                      inputMode="decimal"
                      onChange={(event) => setExtraAmount(event.target.value)}
                      onKeyDown={(event) => onExtraFormKeyDown(event, "amount")}
                      placeholder="$ 0"
                      ref={extraAmountRef}
                      type="text"
                      value={extraAmount}
                    />
                  </label>
                  <button className="button button-primary" onClick={addExtra} type="button">Agregar</button>
                  <button aria-label="Cancelar varios" className="icon-button" onClick={() => { closeExtraForm(); focusScan(); }} type="button"><X size={15} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <aside className="card admin-panel admin-pos-summary" aria-label="Resumen de venta">
        <small className="admin-pos-summary-label">Total a cobrar</small>
        <strong className="admin-pos-total">{formatPrice(totalCents)}</strong>
        <p className="admin-pos-summary-meta">
          {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"} · {lineCount} {lineCount === 1 ? "producto" : "productos"} · {paymentSummary}
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
          <button className="button button-primary admin-pos-close" disabled={!lineCount || submitting || priceDraftInvalid} onClick={closeSale} type="button">
            {submitting ? "Cerrando…" : "Cerrar venta"}
          </button>
          <button className="button button-light" disabled={!lineCount || submitting} onClick={() => { setCart([]); setExtras([]); closeExtraForm(); setNotice(null); setCashDiscountOn(true); setPriceDraftInvalid(false); focusScan(); }} type="button">Vaciar venta</button>
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
      {codeChoice ? (
        <VariantPicker
          code={codeChoice.code}
          onCancel={() => { setCodeChoice(null); focusScan(); }}
          onPick={(variantId) => {
            const match = catalogById.get(variantId);
            if (match) addVariant(match);
            setCodeChoice(null);
            focusScan();
          }}
          options={codeChoice.variantIds.flatMap((variantId) => {
            const variant = catalogById.get(variantId);
            if (!variant) return [];
            const free = variant.stock - (cart.find((item) => item.variantId === variantId)?.quantity ?? 0);
            return [{ id: variantId, brand: variant.brand, name: variant.productName, label: variant.label, priceCents: variant.priceCents, stock: variant.stock, available: free > 0, stockNote: variant.stock > 0 && free <= 0 ? "Todo en la venta" : undefined }];
          })}
        />
      ) : null}
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
