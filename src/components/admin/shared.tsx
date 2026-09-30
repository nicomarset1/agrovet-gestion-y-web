"use client";

// Panel de gestión: tipos, helpers, modales y componentes compartidos entre secciones.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { formatReservationTime, mercadoPagoReservationHours, reservedStatus } from "@/lib/reservation";
import { isSpecialCategorySlug } from "@/lib/special-categories";
import type { Branch, Category, OrderRecord, Product, TrashItem, WholesaleClient } from "@/lib/types";
import { updateOrderAction, updateStockAction } from "@/app/gestion-agrovet/actions";

export type Subcategory = { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null; count: number };

export type Section = "resumen" | "productos" | "categorias" | "punto-venta" | "ventas" | "ventas-web" | "clientes" | "papelera";

export type WebOrderStatus = "Entregado" | "Retirado" | "Cancelado";

export type Period = "day" | "week" | "month" | "year";

export const UNCATEGORIZED_CATEGORY_VALUE = "__none";

export const UNCATEGORIZED_SUBCATEGORY_SLUG = "sin-subcategoria";

const ADMIN_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function AdminModal({
  title,
  subtitle,
  closeHref,
  className,
  zIndex = 140,
  dismissible = true,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  closeHref?: string;
  className?: string;
  zIndex?: number;
  dismissible?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="admin-modal-backdrop" onClick={dismissible ? onClose : undefined} role="presentation" style={{ zIndex }}>
      <div className={`admin-modal card${className ? ` ${className}` : ""}`} onClick={(event) => event.stopPropagation()}>
        <header className="admin-modal-head">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {dismissible ? (closeHref ? (
            <Link aria-label="Cerrar" className="admin-modal-close" href={closeHref}>
              <X size={22} />
            </Link>
          ) : (
            <button aria-label="Cerrar" className="admin-modal-close" onClick={onClose} type="button">
              <X size={22} />
            </button>
          )) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function DeleteOrderModal({
  order,
  onClose,
}: {
  order: OrderRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const branchSummary = getOrderBranchBuckets(order)
    .map((bucket) => `${bucket.branchName}: ${bucket.quantity}`)
    .join(" | ") || order.branchName;
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle={`Vas a mover ${order.code} por ${formatPrice(order.totalCents)} a la papelera.`}
      title="Confirmar eliminación"
      zIndex={240}
    >
      <form
        className="admin-confirm-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          setError("");
          const response = await fetch("/api/admin/orders/delete", {
            method: "POST",
            body: new FormData(event.currentTarget),
          });
          setSubmitting(false);
          if (!response.ok) {
            const result = await response.json().catch(() => null) as { error?: string } | null;
            setError(result?.error ?? "No se pudo eliminar el registro.");
            return;
          }
          onClose();
          router.refresh();
        }}
      >
        <input name="id" type="hidden" value={order.id} />
        <div className="admin-confirm-visual">
          <div className="admin-confirm-icon">
            <Trash2 size={24} />
          </div>
          <div className="admin-confirm-copy">
            <strong>{order.code}</strong>
            <span>
              {branchSummary} | {formatAdminDateTime(order.createdAt, { dateStyle: "long", timeStyle: "short" })}
            </span>
          </div>
        </div>
        <p className="admin-confirm-text">
          Se quitará de las ventas activas y se devolverá el stock reservado. Podrás restaurarlo desde Papelera si todavía hay stock suficiente.
        </p>
        {error ? <p className="notice error admin-span-2">{error}</p> : null}
        <div className="admin-product-list admin-span-2">
          {order.items.map((item) => {
            const allocations = item.allocations?.length
              ? item.allocations
              : [{ branchId: order.branchId, branchName: order.branchName, quantity: item.quantity }];
            return (
              <div className="admin-table-row compact" key={`${order.id}-${item.variantId}`}>
                <div>
                  <strong>{item.brand} {item.productName}</strong>
                  <small>{item.label} | {item.quantity} unidades</small>
                </div>
                <span className="admin-stock-pill">
                  {allocations.map((allocation) => `${allocation.branchName}: ${allocation.quantity}`).join(" | ")}
                </span>
              </div>
            );
          })}
        </div>
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary danger" disabled={submitting} type="submit">{submitting ? "Eliminando..." : "Eliminar registro"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-section-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action ? <div className="admin-section-action">{action}</div> : null}
    </header>
  );
}

export type DashboardDetail =
  | { type: "revenue" }
  | { type: "out-stock" }
  | { type: "day-billing" }
  | { type: "pending-orders" }
  | { type: "day-history" }
  | { type: "channel-history" }
  | { type: "branch-stock" };

export function toDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) return new Date(normalized);
  return new Date(`${normalized}Z`);
}

export function formatAdminDateTime(value: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ADMIN_TIME_ZONE, ...options })
    .format(typeof value === "string" ? toDate(value) : value)
    .replace(/[\u00a0\u202f]/g, " ");
}

export function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCashOrder(order: OrderRecord) {
  return /^Caja\b/i.test(order.source);
}

export function isWholesaleOrder(order: OrderRecord) {
  return /^Mayorista\b/i.test(order.source);
}

export function isWebOrder(order: OrderRecord) {
  return !isCashOrder(order) && !isWholesaleOrder(order);
}

export function isCancelledOrder(order: OrderRecord) {
  return /cancelad/i.test(order.status);
}

// Pedido web con Mercado Pago que ya tiene el stock reservado (12 h) y todavía no está pago.
export function isReservedWebOrder(order: OrderRecord) {
  return isWebOrder(order) && order.status === reservedStatus;
}

// Sin cobro todavía: no suma ingresos ni entra en pendientes de retiro/envío (los reservados van en su propio grupo).
export function isAwaitingOnlinePayment(order: OrderRecord) {
  return isReservedWebOrder(order) || (isWebOrder(order) && /mercado pago/i.test(order.paymentMethod) && order.paidCents < order.totalCents && /pendiente de pago|esperando pago/i.test(order.status));
}

// "Reservado · vence 23:15" (o "vence 30/09 09:15" si es otro día).
export function reservationLabel(order: OrderRecord) {
  const until = order.reservedUntil ? formatReservationTime(order.reservedUntil) : "";
  return until ? `Reservado · vence ${until}` : `Reservado · ${mercadoPagoReservationHours} h`;
}

export function trashTypeLabel(type: TrashItem["type"]) {
  if (type === "order") return "Pedidos";
  if (type === "product") return "Productos";
  if (type === "category") return "Categorías";
  if (type === "client") return "Clientes";
  return "Subcategorías";
}

export function trashTypeSingular(type: TrashItem["type"]) {
  if (type === "order") return "pedido";
  if (type === "product") return "producto";
  if (type === "category") return "categoría";
  if (type === "client") return "cliente";
  return "subcategoría";
}

export function trashDaysUntilPurge(deletedAt: string) {
  const deletedTime = toDate(deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return null;
  const expiresAt = deletedTime + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function dashboardBranchId(order: OrderRecord) {
  return getPrimaryOrderBranchId(order);
}

export function belongsToDashboardBranch(order: OrderRecord, branchId: number) {
  return dashboardBranchId(order) === branchId;
}

export function isPendingWebOrder(order: OrderRecord) {
  return isWebOrder(order) && !isAwaitingOnlinePayment(order) && !/entregado|completado|cancelado|cerrado|retirado/i.test(order.status);
}

export function isCompletedWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /entregado|retirado/i.test(order.status);
}

export function isCancelledWebOrder(order: OrderRecord) {
  return isWebOrder(order) && isCancelledOrder(order);
}

export function isPickupWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /retiro/i.test(order.fulfillment);
}

export function isDeliveryWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /envio/i.test(order.fulfillment);
}

function getOrderBranchBuckets(order: OrderRecord) {
  const buckets = new Map<number, { branchId: number; branchName: string; quantity: number; items: number }>();
  for (const item of order.items) {
    const allocations = item.allocations?.length
      ? item.allocations
      : [{ branchId: order.branchId, branchName: order.branchName, quantity: item.quantity }];
    for (const allocation of allocations) {
      const current = buckets.get(allocation.branchId) ?? {
        branchId: allocation.branchId,
        branchName: allocation.branchName,
        quantity: 0,
        items: 0,
      };
      current.quantity += allocation.quantity;
      current.items += 1;
      buckets.set(allocation.branchId, current);
    }
  }
  return [...buckets.values()].sort((a, b) => a.branchId - b.branchId);
}

function getOrderBranchName(order: OrderRecord) {
  const buckets = getOrderBranchBuckets(order);
  if (!buckets.length) return order.branchName;
  if (buckets.length === 1) return buckets[0].branchName;
  return "Mixto";
}

function getPrimaryOrderBranchId(order: OrderRecord) {
  const buckets = getOrderBranchBuckets(order);
  if (!buckets.length) return order.branchId;
  const ranked = [...buckets].sort((a, b) => b.quantity - a.quantity || a.branchId - b.branchId);
  return ranked[0].branchId;
}

export function orderHasBranch(order: OrderRecord, branchId: number) {
  return getOrderBranchBuckets(order).some((bucket) => bucket.branchId === branchId);
}

export function getOrderBranchRevenueCents(order: OrderRecord, branchId: number) {
  if (isCancelledOrder(order)) return 0;
  if (isAwaitingOnlinePayment(order)) return 0;

  const branchTotal = order.items.reduce((sum, item) => {
    const allocatedQuantity = item.allocations?.reduce((quantity, allocation) => {
      return quantity + (allocation.branchId === branchId ? allocation.quantity : 0);
    }, 0) ?? (order.branchId === branchId ? item.quantity : 0);
    return sum + allocatedQuantity * item.unitPriceCents;
  }, 0);

  return branchTotal || (order.branchId === branchId ? order.totalCents : 0);
}

function getOrderDisplayItems(order: OrderRecord, branchId?: number) {
  return order.items.flatMap((item) => {
    if (branchId === undefined) {
      return [`${item.brand} ${item.productName} ${item.label} x${item.quantity}`];
    }
    const allocatedQuantity = item.allocations?.reduce((sum, allocation) => sum + (allocation.branchId === branchId ? allocation.quantity : 0), 0)
      ?? (order.branchId === branchId ? item.quantity : 0);
    if (allocatedQuantity <= 0) return [];
    return [`${item.brand} ${item.productName} ${item.label} x${allocatedQuantity}`];
  });
}

export function startOfDay(value: Date) {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function formatDayLabel(value: Date) {
  return formatAdminDateTime(value, { weekday: "short", day: "2-digit", month: "2-digit" });
}

function weekStart(value: Date) {
  const copy = startOfDay(value);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy;
}

export function weekKey(value: Date) {
  return dateKey(weekStart(value));
}

export function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function startOfMonth(value: Date) {
  const copy = startOfDay(value);
  copy.setDate(1);
  return copy;
}

function startOfYear(value: Date) {
  const copy = startOfDay(value);
  copy.setMonth(0, 1);
  return copy;
}

export function periodBounds(period: Period, anchor: Date) {
  const start =
    period === "day"
      ? startOfDay(anchor)
      : period === "week"
        ? weekStart(anchor)
        : period === "month"
          ? startOfMonth(anchor)
          : startOfYear(anchor);
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  if (period === "week") end.setDate(end.getDate() + 7);
  if (period === "month") end.setMonth(end.getMonth() + 1);
  if (period === "year") end.setFullYear(end.getFullYear() + 1);
  return { end, start };
}

export function buildAdminHref(base: string, params: Record<string, string | null | undefined>) {
  const url = new URL(base, "http://127.0.0.1:3000");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function leafCategories(categories: Category[]) {
  return categories.filter((category) => !isSpecialCategorySlug(category.slug));
}

export function OrderModal({
  returnTo,
  onClose,
  onRequestDelete,
  order,
}: {
  returnTo: string;
  onClose: () => void;
  onRequestDelete: (order: OrderRecord) => void;
  order: OrderRecord;
}) {
  const sourceMatch = /Caja \/ ([^(]+)(?: \((\d+) cuotas\))?/i.exec(order.source);
  const initialPaymentMethod = sourceMatch?.[1]?.trim() ?? (order.source.toLowerCase().includes("tarjeta") ? "Tarjeta" : "Efectivo");
  const initialInstallments = sourceMatch?.[2] ?? "1";
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod);
  const [installments, setInstallments] = useState(initialInstallments);
  const [itemQuantities, setItemQuantities] = useState(() => order.items.map((item) => String(item.quantity)));
  const sourceValue = isCashOrder(order)
    ? `Caja / ${paymentMethod}${paymentMethod === "Tarjeta" ? ` (${installments} cuotas)` : ""}`
    : order.source;
  const itemTotalCents = order.items.reduce((sum, item, index) => {
    const quantity = Math.max(1, Number(itemQuantities[index]) || item.quantity);
    return sum + item.unitPriceCents * quantity;
  }, 0);
  const customerSummary = [
    order.customerName,
    order.phone,
    order.email,
    order.deliveryAddress || "Sin dirección",
    order.deliveryDistanceKm !== null ? `${order.deliveryDistanceKm} km` : null,
  ].filter(Boolean).join(" | ");
  return (
    <AdminModal
      onClose={onClose}
      subtitle={`${order.code} | ${order.branchName} | ${formatAdminDateTime(order.createdAt, { dateStyle: "long", timeStyle: "short" })}`}
      title={isCashOrder(order) ? "Editar venta" : "Editar pedido"}
    >
      <form action={updateOrderAction} className="admin-modal-form">
        <input name="id" type="hidden" value={order.id} />
        {isCashOrder(order) ? (
          <>
            <label className="admin-field">
              <span>Canal / medio de pago</span>
              <select className="field" onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Transferencia</option>
                <option>QR</option>
              </select>
            </label>
            {paymentMethod === "Tarjeta" ? (
              <label className="admin-field">
                <span>Cuotas</span>
                <select className="field" onChange={(event) => setInstallments(event.target.value)} value={installments}>
                  <option value="1">1 cuota</option>
                  <option value="2">2 cuotas</option>
                  <option value="3">3 cuotas</option>
                  <option value="6">6 cuotas</option>
                  <option value="12">12 cuotas</option>
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        <input name="customerName" type="hidden" value={order.customerName} />
        <input name="phone" type="hidden" value={order.phone} />
        <input name="email" type="hidden" value={order.email} />
        <input name="fulfillment" type="hidden" value={order.fulfillment} />
        <input name="branchId" type="hidden" value={order.branchId} />
        <input name="deliveryAddress" type="hidden" value={order.deliveryAddress} />
        <input name="deliveryDistanceKm" type="hidden" value={order.deliveryDistanceKm ?? ""} />
        <input name="status" type="hidden" value={order.status} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <input name="source" type="hidden" value={sourceValue} />
        <div className="admin-detail-summary compact admin-span-2">
          <strong>Datos del cliente</strong>
          <span>{customerSummary}</span>
          <small>
            {order.fulfillment} | {order.source} | {order.paymentMethod || "Sin medio de pago"} | {order.status}
          </small>
        </div>
        <div className="admin-span-2 admin-order-items">
          <strong>Items</strong>
          {order.items.map((item, index) => (
            <div className="admin-order-item admin-order-item-edit" key={`${item.variantId}-${item.sku}`}>
              <div>
                <span>{item.brand} {item.productName}</span>
                <small>{item.label} | {formatPrice(item.unitPriceCents)}</small>
                {item.allocations?.length ? (
                  <div className="admin-allocation-pills">
                    {item.allocations.map((allocation) => (
                      <span className="admin-stock-pill" key={`${item.variantId}-${allocation.branchId}`}>
                        {allocation.branchName}: {allocation.quantity}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <label className="admin-order-qty">
                <span>Unidades</span>
                <input
                  className="field"
                  min="1"
                  name="itemQuantity"
                  step="1"
                  type="number"
                  value={itemQuantities[index] ?? String(item.quantity)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setItemQuantities((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
                  }}
                />
              </label>
              <input name="itemVariantId" type="hidden" value={item.variantId} />
            </div>
          ))}
        </div>
        <div className="admin-span-2 admin-detail-summary compact">
          <strong>{formatPrice(itemTotalCents)}</strong>
          <span>{order.items.length} productos | {isCashOrder(order) ? "Venta de caja" : `Pedido ${order.fulfillment}`}</span>
        </div>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light danger" onClick={() => onRequestDelete(order)} type="button">
            <Trash2 size={16} /> Borrar registro
          </button>
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">Guardar cambios</button>
        </div>
      </form>
    </AdminModal>
  );
}

function OrderStatusButton({
  order,
  label,
  status,
  returnTo,
}: {
  order: OrderRecord;
  label: string;
  status: string;
  returnTo: string;
}) {
  return (
    <form action={updateOrderAction} className="admin-order-status-form">
      <input name="id" type="hidden" value={order.id} />
      <input name="customerName" type="hidden" value={order.customerName} />
      <input name="phone" type="hidden" value={order.phone} />
      <input name="email" type="hidden" value={order.email} />
      <input name="fulfillment" type="hidden" value={order.fulfillment} />
      <input name="branchId" type="hidden" value={order.branchId} />
      <input name="deliveryAddress" type="hidden" value={order.deliveryAddress} />
      <input name="deliveryDistanceKm" type="hidden" value={order.deliveryDistanceKm ?? ""} />
      <input name="source" type="hidden" value={order.source} />
      <input name="status" type="hidden" value={status} />
      <input name="paymentMethod" type="hidden" value={order.paymentMethod} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {order.items.map((item) => (
        <div key={`${order.id}-${item.variantId}`}>
          <input name="itemVariantId" type="hidden" value={item.variantId} />
          <input name="itemQuantity" type="hidden" value={item.quantity} />
        </div>
      ))}
      <button className="button button-light" type="submit">{label}</button>
    </form>
  );
}

export function PendingOrderCard({
  onSelectOrder,
  order,
  onEditDistribution,
  onCompleteOrder,
  onCancelOrder,
  returnTo,
  dense = false,
  branchId,
  showStatusActions = true,
}: {
  onSelectOrder: (order: OrderRecord) => void;
  order: OrderRecord;
  onEditDistribution?: (order: OrderRecord) => void;
  onCompleteOrder?: (order: OrderRecord, status: WebOrderStatus) => void;
  onCancelOrder?: (order: OrderRecord) => void;
  returnTo: string;
  dense?: boolean;
  branchId?: number;
  showStatusActions?: boolean;
}) {
  const itemLabel = getOrderDisplayItems(order, branchId).slice(0, 3).join(" · ");
  const compactMode = dense || branchId !== undefined;
  // Reservado: todavía no está pago, así que no se puede cerrar como retirado/entregado; solo cancelar (devuelve el stock).
  const reserved = isReservedWebOrder(order);
  return (
    <article className={`admin-pending-card${compactMode ? " dense" : ""}`}>
      <header className="admin-pending-card-head">
        <div>
          <strong>{order.code}</strong>
          {reserved ? <span className="admin-reserved-chip">{reservationLabel(order)}</span> : null}
        </div>
        <div className="admin-pending-card-head-actions">
          <button className="button button-light subtle" onClick={() => onSelectOrder(order)} type="button">
            <ChevronRight size={14} /> Datos cliente
          </button>
        </div>
      </header>
      <div className="admin-pending-card-items horizontal">
        {itemLabel}
        {!branchId && order.items.length > 3 ? ` · +${order.items.length - 3} más` : ""}
      </div>
      <div className="admin-pending-card-footer">
        <div className="admin-order-status-actions">
          {showStatusActions && reserved ? (
            onCancelOrder ? (
              <button className="button button-light" onClick={() => onCancelOrder(order)} type="button">Cancelar</button>
            ) : (
              <OrderStatusButton label="Cancelar" order={order} returnTo={returnTo} status="Cancelado" />
            )
          ) : showStatusActions ? (
            order.fulfillment.toLowerCase().includes("envio") ? (
              <>
                {onCompleteOrder ? (
                  <button className="button button-light" onClick={() => onCompleteOrder(order, "Entregado")} type="button">Entregado</button>
                ) : (
                  <OrderStatusButton label="Entregado" order={order} returnTo={returnTo} status="Entregado" />
                )}
                {onCancelOrder ? (
                  <button className="button button-light" onClick={() => onCancelOrder(order)} type="button">Cancelar</button>
                ) : (
                  <OrderStatusButton label="Cancelar" order={order} returnTo={returnTo} status="Cancelado" />
                )}
              </>
            ) : (
              <>
                {onCompleteOrder ? (
                  <button className="button button-light" onClick={() => onCompleteOrder(order, "Retirado")} type="button">Retirado</button>
                ) : (
                  <OrderStatusButton label="Retirado" order={order} returnTo={returnTo} status="Retirado" />
                )}
                {onCancelOrder ? (
                  <button className="button button-light" onClick={() => onCancelOrder(order)} type="button">Cancelar</button>
                ) : (
                  <OrderStatusButton label="Cancelar" order={order} returnTo={returnTo} status="Cancelado" />
                )}
              </>
            )
          ) : null}
          {onEditDistribution && !reserved ? (
            <button className="button button-light subtle" onClick={() => onEditDistribution(order)} type="button">
              Cambiar sucursal
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WebOrderStatusModal({
  onClose,
  order,
  returnTo,
  status,
}: {
  onClose: () => void;
  order: OrderRecord;
  returnTo: string;
  status: WebOrderStatus;
}) {
  const paymentMatch = /^(Tarjeta)(?: \((\d+) cuotas\))?/i.exec(order.paymentMethod);
  const [paymentMethod, setPaymentMethod] = useState(paymentMatch?.[1] ?? (order.paymentMethod || "Efectivo"));
  const [installments, setInstallments] = useState(paymentMatch?.[2] ?? "1");
  const [submitting, setSubmitting] = useState(false);
  const isCancellation = status === "Cancelado";
  const needsRefundRecord = isCancellation && order.paidCents > 0 && /mercado pago/i.test(order.paymentMethod);
  const paymentMethodValue = paymentMethod === "Tarjeta" ? `Tarjeta (${installments} cuotas)` : paymentMethod;
  return (
    <AdminModal
      dismissible={!submitting}
      onClose={onClose}
      subtitle={`${order.code} | ${order.branchName} | ${isCancellation ? "cancelación de pedido" : status.toLowerCase() === "entregado" ? "cierre de envío" : "cierre de retiro"}`}
      title={isCancellation ? "Cancelar pedido" : `Marcar como ${status.toLowerCase()}`}
    >
      <form
        action={updateOrderAction}
        className="admin-modal-form"
        onSubmit={() => setSubmitting(true)}
      >
        <input name="id" type="hidden" value={order.id} />
        <input name="customerName" type="hidden" value={order.customerName} />
        <input name="phone" type="hidden" value={order.phone} />
        <input name="email" type="hidden" value={order.email} />
        <input name="fulfillment" type="hidden" value={order.fulfillment} />
        <input name="branchId" type="hidden" value={order.branchId} />
        <input name="deliveryAddress" type="hidden" value={order.deliveryAddress} />
        <input name="deliveryDistanceKm" type="hidden" value={order.deliveryDistanceKm ?? ""} />
        <input name="source" type="hidden" value={order.source} />
        <input name="status" type="hidden" value={status} />
        <input name="paymentMethod" type="hidden" value={isCancellation ? order.paymentMethod : paymentMethodValue} />
        <input name="returnTo" type="hidden" value={returnTo} />
        {order.items.map((item) => (
          <div key={`${order.id}-${item.variantId}`}>
            <input name="itemVariantId" type="hidden" value={item.variantId} />
            <input name="itemQuantity" type="hidden" value={item.quantity} />
          </div>
        ))}
        {isCancellation ? (
          <>
            <p className="notice admin-span-2">
              Se cancelará el pedido y se devolverá el stock reservado.
            </p>
            {needsRefundRecord ? (
              <div className="admin-span-2 admin-confirm-refund">
                <label>Devolución al cliente</label>
                <select className="field" name="refundMethod" required defaultValue="">
                  <option value="" disabled>Seleccionar cómo se devolvió</option>
                  <option value="Devuelto por Mercado Pago">Devuelto por Mercado Pago</option>
                  <option value="Transferencia bancaria">Transferencia bancaria</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Queda pendiente de devolución">Queda pendiente de devolución</option>
                  <option value="Otro acuerdo con el cliente">Otro acuerdo con el cliente</option>
                </select>
                <textarea className="field" maxLength={240} name="refundNote" placeholder="Detalle opcional: número de operación, alias, fecha o aclaración para el local." />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <label className="admin-field admin-span-2">
              <span>Medio de pago</span>
              <select className="field" onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Transferencia</option>
                <option>QR</option>
              </select>
            </label>
            {paymentMethod === "Tarjeta" ? (
              <label className="admin-field admin-span-2">
                <span>Cuotas</span>
                <select className="field" onChange={(event) => setInstallments(event.target.value)} value={installments}>
                  <option value="1">1 cuota</option>
                  <option value="2">2 cuotas</option>
                  <option value="3">3 cuotas</option>
                  <option value="6">6 cuotas</option>
                  <option value="12">12 cuotas</option>
                </select>
              </label>
            ) : null}
          </>
        )}
        <div className="admin-detail-summary compact admin-span-2">
          <strong>{order.code}</strong>
          <span>{order.customerName} | {formatPrice(order.totalCents)} | {isCancellation ? order.paymentMethod : paymentMethodValue}</span>
        </div>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" disabled={submitting} type="submit">{isCancellation ? "Confirmar cancelación" : "Confirmar cierre"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function WebOrderDistributionModal({
  branches,
  onClose,
  order,
  products,
  returnTo,
}: {
  branches: Branch[];
  onClose: () => void;
  order: OrderRecord;
  products: Product[];
  returnTo: string;
}) {
  const [assignments, setAssignments] = useState(() => order.items.map((item) => String(item.allocations?.[0]?.branchId ?? order.branchId)));
  const [submitting, setSubmitting] = useState(false);
  const variantMap = useMemo(() => new Map(products.flatMap((product) => product.variants.map((variant) => [variant.id, variant] as const))), [products]);
  const validation = useMemo(() => order.items.map((item, index) => {
    const variant = variantMap.get(item.variantId);
    const branchId = Number(assignments[index] ?? order.branchId);
    const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "Sucursal";
    const stock = variant?.stocks.find((entry) => entry.branchId === branchId)?.quantity ?? 0;
    return {
      branchId,
      branchName,
      quantity: item.quantity,
      stock,
      hasStock: stock >= item.quantity,
      item,
    };
  }), [assignments, branches, order.branchId, order.items, variantMap]);
  const allHaveStock = validation.every((entry) => entry.hasStock);
  const totalShortage = validation.filter((entry) => !entry.hasStock).length;
  return (
    <AdminModal
      dismissible={!submitting}
      onClose={onClose}
      subtitle={`${order.code} | ${order.branchName} | Ajustá qué sucursal descuenta cada producto`}
      title="Editar reparto"
    >
      <form
        action={updateOrderAction}
        className="admin-modal-form"
        onSubmit={() => setSubmitting(true)}
      >
        <input name="id" type="hidden" value={order.id} />
        <input name="customerName" type="hidden" value={order.customerName} />
        <input name="phone" type="hidden" value={order.phone} />
        <input name="email" type="hidden" value={order.email} />
        <input name="fulfillment" type="hidden" value={order.fulfillment} />
        <input name="branchId" type="hidden" value={order.branchId} />
        <input name="deliveryAddress" type="hidden" value={order.deliveryAddress} />
        <input name="deliveryDistanceKm" type="hidden" value={order.deliveryDistanceKm ?? ""} />
        <input name="status" type="hidden" value={order.status} />
        <input name="source" type="hidden" value={order.source} />
        <input name="paymentMethod" type="hidden" value={order.paymentMethod} />
        <input name="returnTo" type="hidden" value={returnTo} />
        {order.items.map((item, index) => (
          <div className="admin-span-2 admin-order-item admin-order-item-edit" key={`${order.id}-${item.variantId}`}>
            <div>
              <span>{item.brand} {item.productName}</span>
              <small>{item.label} | {item.quantity} unidades</small>
              <small>
                {validation[index]?.hasStock
                  ? `${validation[index]?.branchName} tiene ${validation[index]?.stock} unidades`
                  : `No hay stock en ${validation[index]?.branchName}`}
              </small>
            </div>
            <label className="admin-field">
              <span>Sucursal</span>
              <select
                className="field"
                onChange={(event) => {
                  const value = event.target.value;
                  setAssignments((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
                }}
                value={assignments[index] ?? String(order.branchId)}
              >
                {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
              </select>
            </label>
            <input name="allocationVariantId" type="hidden" value={item.variantId} />
            <input name="allocationBranchId" type="hidden" value={assignments[index] ?? String(order.branchId)} />
            <input name="allocationQuantity" type="hidden" value={item.quantity} />
            <input name="itemVariantId" type="hidden" value={item.variantId} />
            <input name="itemQuantity" type="hidden" value={item.quantity} />
          </div>
        ))}
        {!allHaveStock ? (
          <p className="notice error admin-span-2">No hay stock suficiente para reasignar {totalShortage} producto{totalShortage === 1 ? "" : "s"} en la sucursal seleccionada.</p>
        ) : null}
        <div className="admin-detail-summary compact admin-span-2">
          <strong>{order.items.length} productos</strong>
          <span>{getOrderBranchName(order)} | {formatPrice(order.totalCents)}</span>
        </div>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" disabled={submitting || !allHaveStock} type="submit">Guardar reparto</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function StockEditModal({
  branch,
  onClose,
  product,
  variantId,
  returnTo,
}: {
  branch: Branch;
  onClose: () => void;
  product: Product;
  variantId?: number;
  returnTo: string;
}) {
  const mainVariant = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
  if (!mainVariant) return null;
  const currentStock = mainVariant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0;
  return (
    <AdminModal
      onClose={onClose}
      zIndex={150}
      subtitle={`${product.brand} ${product.name} | ${mainVariant.label} | Stock actual: ${currentStock} u.`}
      title={`Editar stock en ${branch.name}`}
    >
      <form action={updateStockAction} className="admin-modal-form">
        <input name="variantId" type="hidden" value={mainVariant.id} />
        <input name="branchId" type="hidden" value={branch.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="admin-field admin-span-2">
          <span>Unidades a agregar</span>
          <input
            autoFocus
            className="field"
            defaultValue={0}
            inputMode="numeric"
            min="0"
            name="quantity"
            step="1"
            type="number"
            required
          />
          <small className="description">Se suma únicamente al stock de {branch.name}. Usa teclado o flechas.</small>
        </label>
        <div className="admin-modal-actions admin-span-2 admin-modal-actions-sticky">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">Guardar stock</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function BranchPickerModal({
  branchHref,
  branches,
  mandatory,
  onSelect,
  onClose,
  selectedBranchId,
}: {
  branchHref: (branchId: number) => string;
  branches: Branch[];
  mandatory?: boolean;
  onSelect: () => void;
  onClose: () => void;
  selectedBranchId: number;
}) {
  return (
    <AdminModal
      className="admin-branch-picker-modal"
      dismissible={!mandatory}
      onClose={onClose}
      subtitle={mandatory ? "Cada día al entrar, elegí la sucursal que vas a administrar." : "Definí la sucursal activa para el panel y el stock editable."}
      title="Elegir sucursal"
    >
      <div className="admin-detail-stack admin-branch-picker-grid">
        {branches.map((branch) => (
          <Link
            className={`button button-light ${branch.id === selectedBranchId ? "active" : ""}`}
            href={branchHref(branch.id)}
            key={branch.id}
            onClick={() => {
              const todayKey = dateKey(new Date());
              window.localStorage.setItem("agrovet-admin-branch-day", todayKey);
              onSelect();
            }}
          >
            {branch.name}
          </Link>
        ))}
      </div>
    </AdminModal>
  );
}

export function StatCard({
  label,
  note,
  onClick,
  href,
  value,
}: {
  label: string;
  value: string;
  note?: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <small>{label}</small>
      <strong>{value}</strong>
      {note ? <span>{note}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link className="card admin-stat admin-stat-button" href={href}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button className="card admin-stat admin-stat-button" onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return <div className="card admin-stat">{content}</div>;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const noopSubscribe = () => () => {};

// true en renders solo de cliente; false en el servidor y al hidratar el HTML ya pintado.
function useClientRender() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// Cuenta hasta el valor en ~600 ms con requestAnimationFrame. Solo cuando cambia animateKey (primera
// aparición o cambio de período) y si el número no vino pintado del servidor; si el valor cambia por
// el live-sync, se muestra directo.
export function CountUp({ value, format, animateKey }: { value: number; format: (value: number) => string; animateKey: string }) {
  const clientRender = useClientRender();
  const [shown, setShown] = useState(() => (clientRender && !prefersReducedMotion() ? 0 : value));
  const lastKey = useRef<string | null>(clientRender ? null : animateKey);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const shouldAnimate = lastKey.current !== animateKey && !prefersReducedMotion();
    lastKey.current = animateKey;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (!shouldAnimate) {
      frame.current = requestAnimationFrame(() => setShown(value));
      return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
    }
    const startedAt = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [animateKey, value]);
  return <>{format(shown)}</>;
}

export type AdminModalState =
  | { type: "category-create"; parentCategoryId?: number }
  | { type: "category-edit"; category: Category }
  | { type: "category-delete"; category: Category; stage: 1 | 2 }
  | { type: "subcategory-create"; categoryId?: number }
  | { type: "subcategory-edit"; subcategory: Subcategory }
  | { type: "subcategory-delete"; subcategory: Subcategory; stage: 1 | 2 }
  | { type: "product-create" }
  | { type: "product-edit"; product: Product }
  | { type: "product-delete"; product: Product }
  | { type: "stock-edit"; product: Product; variantId?: number; returnTo: string }
  | { type: "wholesale-client-create" }
  | { type: "wholesale-client-edit"; client: WholesaleClient }
  | null;
