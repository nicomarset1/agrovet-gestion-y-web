"use client";

// Panel de gestión: sección Caja (venta de mostrador).

import { useRouter } from "next/navigation";
import { Grid2x2, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { Select } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatRange } from "@/components/ui/date-utils";
import type { Branch, OrderRecord, Product } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import { closePosSaleAction } from "@/app/gestion-agrovet/actions";
import { INSTALLMENT_OPTIONS, PAYMENT_OPTIONS, SectionHeader, dateKey, formatAdminDateTime, isCancelledOrder, isCashOrder, toDate } from "@/components/admin/shared";

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
  type PosLine = { variantId: number; productName: string; brand: string; label: string; sku: string; barcode: string; quantity: number; priceCents: number; stock: number };
  const [scanValue, setScanValue] = useState("");
  const [cart, setCart] = useState<PosLine[]>([]);
  const [notice, setNotice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [installments, setInstallments] = useState("1");
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
  const totalCents = cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  function pushVariant(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    const compact = value.replace(/\s+/g, "");
    const match = catalogVariants.find((variant) => [variant.barcode, variant.sku, variant.barcode.replace(/\s+/g, ""), variant.sku.replace(/\s+/g, "")].includes(value) || [variant.barcode.replace(/\s+/g, ""), variant.sku.replace(/\s+/g, ""), variant.label].includes(compact));
    if (!match) {
      setNotice("No se encontró un producto con ese código.");
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.variantId === match.variantId);
      const quantity = existing?.quantity ?? 0;
      if (quantity >= match.stock) {
        setNotice("No queda stock en esta sucursal para ese producto.");
        return current;
      }
      setNotice(`${match.brand} ${match.productName} agregado.`);
      if (existing) {
        return current.map((item) => (item.variantId === match.variantId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { ...match, quantity: 1 }];
    });
  }
  function increaseLine(variantId: number) {
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
    if (!cart.length || submitting) return;
    setSubmitting(true);
    setNotice("");
    try {
      const result = await closePosSaleAction({
        branchId: branch.id,
        paymentMethod,
        installments: paymentMethod === "Tarjeta" ? installments : undefined,
        items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      });
      if (!result.ok) throw new Error(result.error);
      setCart([]);
      setScanValue("");
      setNotice(`Venta cerrada: ${result.code}`);
      push({ title: "Venta cerrada", message: result.code, type: "success" });
      setShowDaySales(true);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cerrar la venta.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="admin-point-grid">
      <section className="card admin-panel">
        <div className="admin-point-banner">
          <div>
            <strong>{branch.name}</strong>
            <span>Sucursal activa para registrar ventas</span>
          </div>
          <span className="admin-stock-pill">{branch.name}</span>
        </div>
        <div className="admin-point-field">
          <label>Escanear código de barras</label>
          <div className="admin-scan-row">
            <input
              autoFocus
              className="field"
              onChange={(event) => setScanValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  pushVariant(scanValue);
                  setScanValue("");
                }
              }}
              placeholder="Escaneá o escribí el código..."
              value={scanValue}
            />
            <button aria-label="Agregar producto" className="button button-primary" onClick={() => { pushVariant(scanValue); setScanValue(""); }} type="button"><PackagePlus size={18} /></button>
          </div>
        </div>
        <div className="admin-point-inline">
          <label>
            <span id="caja-medio-de-pago">Medio de pago</span>
            <Select ariaLabelledBy="caja-medio-de-pago" onChange={setPaymentMethod} options={PAYMENT_OPTIONS} value={paymentMethod} />
          </label>
          {paymentMethod === "Tarjeta" ? (
            <label>
              <span id="caja-cuotas">Cuotas</span>
              <Select ariaLabelledBy="caja-cuotas" onChange={setInstallments} options={INSTALLMENT_OPTIONS} value={installments} />
            </label>
          ) : null}
        </div>
        <div className="admin-pos-cart">
          {cart.length ? cart.map((item) => (
            <div className="admin-pos-line" key={item.variantId}>
              <div>
                <strong>{item.brand} {item.productName}</strong>
                <small>{item.label} | {item.barcode}</small>
              </div>
              <div className="admin-pos-line-right">
                <div className="admin-pos-line-controls">
                  <button className="qty-button" onClick={() => decreaseLine(item.variantId)} type="button">-</button>
                  <span>{item.quantity} u.</span>
                  <button className="qty-button" onClick={() => increaseLine(item.variantId)} type="button">+</button>
                  <button className="qty-button danger" onClick={() => removeLine(item.variantId)} type="button" aria-label="Eliminar producto">×</button>
                </div>
                <small>{formatPrice(item.priceCents)}</small>
              </div>
            </div>
          )) : (
            <div className="admin-empty-state">
              <Grid2x2 size={50} />
              <strong>La venta está vacía</strong>
              <span>Escaneá un código de barras para empezar</span>
            </div>
          )}
        </div>
        {notice ? <p className="description">{notice}</p> : null}
      </section>
      <aside className="card admin-panel">
        <h2>Resumen de venta</h2>
        <div className="admin-summary-line"><span>Productos</span><strong>{totalUnits} unidades</strong></div>
        <div className="admin-summary-line"><span>Total</span><strong>{formatPrice(totalCents)}</strong></div>
        <div className="admin-point-actions">
          <button className="button button-primary" disabled={!cart.length || submitting} onClick={closeSale} type="button">Cerrar venta</button>
          <button className="button button-light" disabled={!cart.length || submitting} onClick={() => setCart([])} type="button">Vaciar venta</button>
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
            )) : <p className="description">No hay ventas registradas hoy en esta sucursal.</p>}
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
    <SectionHeader subtitle="Registra ventas desde el scanner y el código de barras" title="Caja" />
    <PointOfSalePanel branch={branch} onDeleteOrder={onDeleteOrder} onEditOrder={onEditOrder} orders={orders} products={products} />
    </div>
    </>
  );
}
