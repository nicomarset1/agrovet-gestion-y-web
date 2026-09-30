"use client";

// Panel de gestión: sección Dashboard (resumen del período, gráficos y detalles del tablero).

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatPrice } from "@/lib/format";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatRange, parseIsoDate, toIsoDate } from "@/components/ui/date-utils";
import type { Branch, OrderRecord, Product } from "@/lib/types";
import { AdminModal, CountUp, PendingOrderCard, SectionHeader, buildAdminHref, dateKey, formatAdminDateTime, formatDayLabel, getOrderBranchRevenueCents, isCancelledOrder, isCashOrder, isPendingWebOrder, isWholesaleOrder, monthKey, startOfDay, startOfMonth, toDate, weekKey } from "@/components/admin/shared";
import type { DashboardDetail, WebOrderStatus } from "@/components/admin/shared";

export function DashboardDetailModal({
  closeHref,
  currentHref,
  branches,
  detail,
  onClose,
  onCompleteOrder,
  onEditStock,
  orders,
  products,
  selectedBranch,
  onSelectOrder,
}: {
  closeHref: string;
  currentHref: string;
  branches: Branch[];
  detail: DashboardDetail;
  onClose: () => void;
  onCompleteOrder: (order: OrderRecord, status: WebOrderStatus) => void;
  onEditStock: (product: Product, variantId?: number) => void;
  orders: OrderRecord[];
  products: Product[];
  selectedBranch: Branch;
  onSelectOrder: (order: OrderRecord) => void;
}) {
  const [alertView, setAlertView] = useState<"out" | "low">("out");
  const [selectedDay, setSelectedDay] = useState("");
  const now = new Date();
  const todayKey = dateKey(now);
  const selectedDayValue = selectedDay || todayKey;
  const selectedBranchOrders = useMemo(() => orders.filter((order) => getOrderBranchRevenueCents(order, selectedBranch.id) > 0), [orders, selectedBranch.id]);
  const monthGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const order of selectedBranchOrders) {
      const key = monthKey(toDate(order.createdAt));
      groups.set(key, (groups.get(key) ?? 0) + getOrderBranchRevenueCents(order, selectedBranch.id));
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [selectedBranch.id, selectedBranchOrders]);
  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const stockPresentations = useMemo(() => activeProducts.flatMap((product) => product.variants.map((variant) => ({
    product,
    variant,
    quantity: variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0,
  }))), [activeProducts, selectedBranch.id]);
  const outOfStock = useMemo(() => stockPresentations.filter((item) => item.quantity === 0), [stockPresentations]);
  const lowStock = useMemo(() => stockPresentations.filter((item) => item.quantity > 0 && item.quantity <= 3), [stockPresentations]);
  const allDays = useMemo(() => {
    const groups = new Map<string, { orders: OrderRecord[]; totalCents: number }>();
    for (const order of selectedBranchOrders) {
      const key = dateKey(toDate(order.createdAt));
      const entry = groups.get(key) ?? { orders: [], totalCents: 0 };
      entry.orders.push(order);
      entry.totalCents += getOrderBranchRevenueCents(order, selectedBranch.id);
      groups.set(key, entry);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, value]) => ({
      date,
      totalCents: value.totalCents,
      orders: value.orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
  }, [selectedBranch.id, selectedBranchOrders]);
  const selectedOrders = useMemo(
    () => selectedBranchOrders.filter((order) => dateKey(toDate(order.createdAt)) === selectedDayValue),
    [selectedBranchOrders, selectedDayValue],
  );
  const todayOrders = useMemo(() => selectedBranchOrders.filter((order) => isCashOrder(order) && dateKey(toDate(order.createdAt)) === todayKey), [selectedBranchOrders, todayKey]);
  const pendingOrders = useMemo(() => selectedBranchOrders.filter((order) => isPendingWebOrder(order)), [selectedBranchOrders]);
  const channelWeeks = useMemo(() => {
    const groups = new Map<string, Record<string, number>>();
    for (const order of orders) {
      if (isCancelledOrder(order)) continue;
      const key = weekKey(toDate(order.createdAt));
      const current = groups.get(key) ?? {};
      if (order.branchId === 1) current["Sucursal Independencia"] = (current["Sucursal Independencia"] ?? 0) + getOrderBranchRevenueCents(order, 1);
      else if (order.branchId === 2) current["Sucursal Belgrano"] = (current["Sucursal Belgrano"] ?? 0) + getOrderBranchRevenueCents(order, 2);
      groups.set(key, current);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);
  const branchInventory = useMemo(() => branches.map((branch) => {
    const zero = activeProducts.filter((product) => product.variants.every((variant) => (variant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0) === 0));
    return { branch, zero };
  }), [activeProducts, branches]);
  const stockAlertList = alertView === "out" ? outOfStock : lowStock;
  const stockAlertProducts = useMemo(() => {
    const grouped = new Map<number, { product: Product; alertCount: number }>();
    for (const item of stockAlertList) {
      const current = grouped.get(item.product.id);
      grouped.set(item.product.id, {
        product: item.product,
        alertCount: (current?.alertCount ?? 0) + 1,
      });
    }
    return [...grouped.values()];
  }, [stockAlertList]);
  const stockAlertTitle = alertView === "out" ? "Presentaciones sin stock" : "Presentaciones con stock bajo";

  return (
    <AdminModal
      closeHref={closeHref}
      onClose={onClose}
      subtitle="Detalle operativo del tablero"
      title={
        detail.type === "revenue"
          ? "Ingresos totales"
          : detail.type === "out-stock"
            ? stockAlertTitle
            : detail.type === "day-billing"
              ? "Facturación del día"
              : detail.type === "pending-orders"
                ? "Pedidos pendientes"
                : detail.type === "day-history"
                  ? "Registro de ventas por día"
                  : detail.type === "channel-history"
                    ? "Ingresos por canal"
                    : "Inventario por sucursal"
      }
    >
      <div className="admin-detail-stack">
        {detail.type === "revenue" ? (
          <>
            <div className="admin-detail-summary">
              <strong>{formatPrice(selectedBranchOrders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranch.id), 0))}</strong>
              <span>Acumulado de {selectedBranch.name}</span>
            </div>
            <div className="admin-detail-summary compact">
              <strong>{formatPrice(todayOrders.reduce((sum, order) => sum + order.totalCents, 0))}</strong>
              <span>Facturación de hoy en {selectedBranch.name}</span>
            </div>
            <div className="admin-history-list">
              {monthGroups.map(([month, total]) => (
                <div className="admin-history-row" key={month}>
                  <strong>{month}</strong>
                  <span>{formatPrice(total)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {detail.type === "out-stock" ? (
          <>
            <div className="admin-detail-summary">
              <strong>{alertView === "out" ? `${outOfStock.length} presentaciones sin stock` : `${lowStock.length} presentaciones con stock bajo`}</strong>
              <span>La sucursal activa es {selectedBranch.name}</span>
            </div>
            <div className="admin-view-tabs">
              <button className={`choice-card ${alertView === "out" ? "active" : ""}`} onClick={() => setAlertView("out")} type="button">Sin stock</button>
              <button className={`choice-card ${alertView === "low" ? "active" : ""}`} onClick={() => setAlertView("low")} type="button">Stock bajo</button>
            </div>
            <div className="admin-product-list">
              {stockAlertProducts.map(({ product, alertCount }) => (
                <details className="admin-table-row compact admin-stock-product" key={product.id}>
                  <summary className="admin-stock-product-summary">
                    <span className="admin-stock-product-copy">
                      <strong>{product.brand} {product.name}</strong>
                      <small>{product.category} | {product.subcategory} | {product.variants.length} presentaciones | {selectedBranch.name}</small>
                    </span>
                    <span className={`admin-stock-pill ${alertView === "out" ? "danger" : ""}`}>
                      {alertCount} {alertView === "out" ? "sin stock" : "con stock bajo"}
                    </span>
                    <span className="admin-stock-product-toggle">Ver presentaciones</span>
                  </summary>
                  <div className="admin-stock-variant-list">
                    {product.variants.map((variant) => {
                      const quantity = variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0;
                      return (
                        <div className="admin-stock-variant-row" key={variant.id}>
                          <div>
                            <strong>{variant.label}</strong>
                            <small>{quantity} unidades en {selectedBranch.name}</small>
                          </div>
                          <div className="admin-row-actions">
                            {quantity === 0 ? <span className="admin-stock-pill danger">Sin stock</span> : quantity <= 3 ? <span className="admin-stock-pill">Stock bajo</span> : <span className="admin-stock-pill muted">Disponible</span>}
                            <button className="button button-light" onClick={() => onEditStock(product, variant.id)} type="button">Sumar stock</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
            <button className="button button-light" onClick={() => setAlertView(alertView === "out" ? "low" : "out")} type="button">
              {alertView === "out" ? "Ver stock bajo" : "Ver sin stock"}
            </button>
          </>
        ) : null}
        {detail.type === "day-billing" ? (
          <>
            <div className="admin-detail-summary">
              <strong>{todayOrders.length} ventas registradas hoy</strong>
              <span>Ventas de caja en {selectedBranch.name}</span>
            </div>
            <div className="admin-product-list">
              {todayOrders.length ? todayOrders.map((order) => (
                <div className="admin-table-row compact" key={order.id}>
                  <div>
                    <strong>{order.code}</strong>
                    <small>{order.customerName} | {order.branchName} | {formatAdminDateTime(order.createdAt, { timeStyle: "short" })}</small>
                  </div>
                  <button className="button button-light" onClick={() => onSelectOrder(order)} type="button">Ver detalle</button>
                </div>
              )) : <p className="description">No hay ventas registradas para hoy.</p>}
            </div>
          </>
        ) : null}
        {detail.type === "pending-orders" ? (
          <>
            <div className="admin-detail-summary">
              <strong>{pendingOrders.length} pedidos en curso</strong>
              <span>Seguimiento operativo de pedidos de la web</span>
            </div>
            <div className="admin-pending-grid">
              {pendingOrders.length ? pendingOrders.map((order) => (
                <PendingOrderCard
                  key={order.id}
                  onCompleteOrder={onCompleteOrder}
                  onCancelOrder={(nextOrder) => onCompleteOrder?.(nextOrder, "Cancelado")}
                  onSelectOrder={onSelectOrder}
                  order={order}
                  returnTo={currentHref}
                />
              )) : <p className="description">No hay pedidos pendientes en este momento.</p>}
            </div>
          </>
        ) : null}
        {detail.type === "day-history" ? (
          <>
            <div className="admin-toolbar admin-toolbar-stack">
              <label className="admin-point-field">
                <span>Elegir día</span>
                <input className="field" onChange={(event) => setSelectedDay(event.target.value)} type="date" value={selectedDayValue} />
              </label>
              <div className="admin-detail-summary compact">
                <strong>{formatPrice(selectedOrders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranch.id), 0))}</strong>
                <span>{selectedOrders.length} ventas en la fecha seleccionada de {selectedBranch.name}</span>
              </div>
            </div>
            <div className="admin-history-list">
              {allDays.map((day) => (
                <button className={`admin-history-row ${day.date === selectedDayValue ? "active" : ""}`} key={day.date} onClick={() => setSelectedDay(day.date)} type="button">
                  <strong>{day.date}</strong>
                  <span>{formatPrice(day.totalCents)} | {day.orders.length} ventas</span>
                </button>
              ))}
            </div>
            <div className="admin-product-list">
              {selectedOrders.length ? selectedOrders.map((order) => (
                <div className="admin-table-row compact" key={order.id}>
                  <div>
                    <strong>{order.code}</strong>
                    <small>{order.customerName} | {order.branchName} | {formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</small>
                  </div>
                  <button className="button button-light" onClick={() => onSelectOrder(order)} type="button">Ver detalle</button>
                </div>
              )) : <p className="description">No hay ventas para esa fecha.</p>}
            </div>
          </>
        ) : null}
        {detail.type === "channel-history" ? (
          <>
            <div className="admin-detail-summary">
              <strong>Ingresos por canal</strong>
              <span>Porcentaje y monto de la semana actual</span>
            </div>
            <div className="admin-donut-card">
              <div className="admin-donut-chart" />
              <div className="admin-donut-list">
                {Object.entries(channelWeeks[0]?.[1] ?? {}).map(([channel, value]) => (
                  <div className="admin-donut-row" key={channel}>
                    <strong>{channel}</strong>
                    <span>{formatPrice(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {detail.type === "branch-stock" ? (
          <>
            <div className="admin-detail-summary">
              <strong>Inventario por sucursal</strong>
              <span>Solo la sucursal activa permite editar stock</span>
            </div>
            <div className="admin-branch-stock-grid">
              {branchInventory.map(({ branch, zero }) => (
                <section className="admin-branch-stock-card" key={branch.id}>
                  <strong>{branch.name}</strong>
                  <small>{zero.length} productos sin stock</small>
                  <div className="admin-mini-list">
                    {zero.slice(0, 8).map((product) => {
                      const mainVariant = product.variants[0];
                      const currentQuantity = mainVariant?.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0;
                      const canEdit = branch.id === selectedBranch.id;
                      return (
                        <div className="admin-mini-list-row" key={product.id}>
                          <span>{product.brand} {product.name}</span>
                          <small>{currentQuantity} u.</small>
                          {canEdit ? <button className="button button-light" onClick={() => onEditStock(product)} type="button">Editar stock</button> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}

type DashboardPeriod = "today" | "7d" | "month" | "custom";
type DashboardCustomRange = { from: string; to: string };

const DASHBOARD_PERIOD_STORAGE_KEY = "agrovet-dashboard-period";

const DASHBOARD_PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "month", label: "Este mes" },
];

const DASHBOARD_PALETTE = ["#5b0f73", "#8b5cf6", "#c4a5f5", "#2f9e5b", "#d58a18", "#6c5a7d"];

function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Período actual y el anterior equivalente, en hora local (igual que el resto del panel).
function dashboardRanges(period: DashboardPeriod, now: Date, custom: DashboardCustomRange | null) {
  const today = startOfDay(now);
  const customStart = custom ? parseIsoDate(custom.from) : null;
  const customEnd = custom ? parseIsoDate(custom.to) : null;
  if (period === "custom" && custom && customStart && customEnd) {
    // Rango elegido: el anterior es un tramo del mismo largo que termina justo antes.
    const start = startOfDay(customStart);
    const end = addDays(startOfDay(customEnd), 1);
    const length = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const label = formatRange(custom.from, custom.to);
    return {
      current: { start, end },
      previous: { start: addDays(start, -length), end: start },
      compareLabel: length === 1 ? "vs el día anterior" : `vs los ${length} días anteriores`,
      previousName: length === 1 ? "El día anterior" : `Los ${length} días anteriores`,
      periodLabel: label,
    };
  }
  if (period === "today") {
    return {
      current: { start: today, end: addDays(today, 1) },
      previous: { start: addDays(today, -1), end: today },
      compareLabel: "vs ayer",
      previousName: "Ayer",
      periodLabel: "hoy",
    };
  }
  if (period === "7d") {
    const start = addDays(today, -6);
    return {
      current: { start, end: addDays(today, 1) },
      previous: { start: addDays(start, -7), end: start },
      compareLabel: "vs 7 días anteriores",
      previousName: "Los 7 días anteriores",
      periodLabel: "en los últimos 7 días",
    };
  }
  const monthStart = startOfMonth(now);
  const previousMonthStart = new Date(monthStart);
  previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
  // Mes pasado hasta el mismo día, para comparar períodos del mismo largo.
  const elapsedDays = Math.round((today.getTime() - monthStart.getTime()) / 86_400_000) + 1;
  const previousEnd = addDays(previousMonthStart, elapsedDays);
  return {
    current: { start: monthStart, end: addDays(today, 1) },
    previous: { start: previousMonthStart, end: previousEnd < monthStart ? previousEnd : monthStart },
    compareLabel: "vs el mes pasado a esta altura",
    previousName: "El mes pasado a esta altura",
    periodLabel: "este mes",
  };
}

function orderPaymentLabel(order: OrderRecord) {
  const cash = /^Caja \/ ([^(]+)/i.exec(order.source);
  const raw = (cash ? cash[1] : order.paymentMethod || "").trim();
  if (/mercado pago/i.test(raw)) return "Mercado Pago";
  if (/efectivo/i.test(raw)) return "Efectivo";
  if (/tarjeta/i.test(raw)) return "Tarjeta";
  if (/transferencia/i.test(raw)) return "Transferencia";
  if (/^qr$/i.test(raw)) return "QR";
  if (/cuenta corriente/i.test(raw)) return "Cuenta corriente";
  return raw || "Otro";
}

function orderChannelLabel(order: OrderRecord) {
  if (isCashOrder(order)) return "Mostrador";
  if (isWholesaleOrder(order)) return "Mayoristas";
  return "Tienda online";
}

function shareRows(totals: Map<string, number>) {
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], index) => ({
      name,
      value,
      percent: total ? Math.round((value / total) * 100) : 0,
      color: DASHBOARD_PALETTE[index % DASHBOARD_PALETTE.length],
    }));
}

function ShareCard({
  title,
  description,
  rows,
  emptyText,
}: {
  title: string;
  description: string;
  rows: ReturnType<typeof shareRows>;
  emptyText: string;
}) {
  // Dona solo si hay dos o más valores con datos; con uno solo alcanza con la lista.
  const stops = rows.map((row, index) => {
    const start = rows.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
    return `${row.color} ${start}% ${index === rows.length - 1 ? 100 : Math.min(100, start + row.percent)}%`;
  });
  const gradient = `conic-gradient(${stops.join(", ")})`;
  return (
    <section className="card admin-panel admin-dash-card">
      <header className="admin-dash-card-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {rows.length ? (
        <div className={`admin-share${rows.length > 1 ? " has-donut" : ""}`}>
          {rows.length > 1 ? <div className="admin-donut-chart admin-share-donut" style={{ background: gradient }} role="img" aria-label={rows.map((row) => `${row.name} ${row.percent}%`).join(", ")} /> : null}
          <ul className="admin-share-list">
            {rows.map((row) => (
              <li key={row.name}>
                <span className="admin-share-name"><i aria-hidden="true" className="admin-donut-dot" style={{ background: row.color }} />{row.name}</span>
                <strong>{formatPrice(row.value)}</strong>
                <small>{row.percent}%</small>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="admin-dash-empty">{emptyText}</p>
      )}
    </section>
  );
}

function DashboardOverview({
  orders,
  branches,
  selectedBranch,
  basePath,
  zeroStockCount,
  lowStockCount,
  pendingCount,
}: {
  orders: OrderRecord[];
  branches: Branch[];
  selectedBranch: Branch;
  basePath: string;
  zeroStockCount: number;
  lowStockCount: number;
  pendingCount: number;
}) {
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [customRange, setCustomRange] = useState<DashboardCustomRange | null>(null);
  const [periodChanges, setPeriodChanges] = useState(0);
  const periodStorageReady = useRef(false);
  const choosePeriod = (next: DashboardPeriod) => {
    if (next === period && next !== "custom") return;
    setPeriod(next);
    setPeriodChanges((count) => count + 1);
  };
  const chooseCustomRange = (from: string, to: string) => {
    if (!from || !to) {
      setCustomRange(null);
      choosePeriod("today");
      return;
    }
    setCustomRange({ from, to });
    choosePeriod("custom");
  };
  const animateKey = `${period}:${periodChanges}`;
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DASHBOARD_PERIOD_STORAGE_KEY);
    } catch {
      stored = null;
    }
    queueMicrotask(() => {
      periodStorageReady.current = true;
      if (stored === "today" || stored === "7d" || stored === "month") setPeriod(stored);
    });
  }, []);
  useEffect(() => {
    if (!periodStorageReady.current || period === "custom") return;
    try {
      window.localStorage.setItem(DASHBOARD_PERIOD_STORAGE_KEY, period);
    } catch {
      // Sin almacenamiento el período vuelve a "Hoy" en la próxima carga.
    }
  }, [period]);

  const detailLink = (type: DashboardDetail["type"]) => buildAdminHref(basePath, {
    branch: String(selectedBranch.id),
    detail: type,
    order: null,
    section: "resumen",
  });
  const ranges = dashboardRanges(period, new Date(), customRange);
  const isCustom = period === "custom" && customRange !== null;
  const periodName = isCustom ? ranges.periodLabel : DASHBOARD_PERIODS.find((item) => item.id === period)?.label ?? "Hoy";

  // Pedidos que suman dinero a la sucursal activa (sin cancelados ni pagos online pendientes).
  const salesIn = (range: { start: Date; end: Date }, branchId: number) => orders
    .map((order) => ({ order, cents: getOrderBranchRevenueCents(order, branchId), at: toDate(order.createdAt) }))
    .filter((entry) => entry.cents > 0 && entry.at >= range.start && entry.at < range.end);
  const current = salesIn(ranges.current, selectedBranch.id);
  const previous = salesIn(ranges.previous, selectedBranch.id);
  const totalCents = current.reduce((sum, entry) => sum + entry.cents, 0);
  const previousCents = previous.reduce((sum, entry) => sum + entry.cents, 0);
  const averageCents = current.length ? Math.round(totalCents / current.length) : 0;
  const change = previousCents > 0 ? Math.round(((totalCents - previousCents) / previousCents) * 100) : null;

  const days = (() => {
    const first = period === "month" || isCustom ? ranges.current.start : addDays(startOfDay(new Date()), -6);
    const list: { key: string; label: string; cents: number }[] = [];
    for (let day = new Date(first); day < ranges.current.end; day = addDays(day, 1)) {
      list.push({ key: dateKey(day), label: formatDayLabel(day), cents: 0 });
    }
    const byKey = new Map(list.map((item) => [item.key, item]));
    const range = { start: first, end: ranges.current.end };
    for (const entry of salesIn(range, selectedBranch.id)) {
      const item = byKey.get(dateKey(entry.at));
      if (item) item.cents += entry.cents;
    }
    return list;
  })();
  const maxDay = Math.max(...days.map((day) => day.cents), 1);

  const channelTotals = new Map<string, number>([["Mostrador", 0], ["Tienda online", 0]]);
  const paymentTotals = new Map<string, number>();
  for (const entry of current) {
    const channel = orderChannelLabel(entry.order);
    const payment = orderPaymentLabel(entry.order);
    channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + entry.cents);
    paymentTotals.set(payment, (paymentTotals.get(payment) ?? 0) + entry.cents);
  }
  const channelRows = shareRows(channelTotals);
  const paymentRows = shareRows(paymentTotals);
  const branchRows = branches.map((branch) => ({
    branch,
    cents: salesIn(ranges.current, branch.id).reduce((sum, entry) => sum + entry.cents, 0),
  }));
  const branchTotal = branchRows.reduce((sum, row) => sum + row.cents, 0);
  const emptyText = isCustom
    ? "No hubo ventas entre esas fechas."
    : period === "today" ? "Todavía no hay ventas hoy." : period === "7d" ? "No hubo ventas en los últimos 7 días." : "Todavía no hay ventas este mes.";

  return (
    <>
      <div className="admin-dashboard-bar">
        <div className="admin-period-toggle admin-dashboard-period" role="group" aria-label="Período del dashboard">
          {DASHBOARD_PERIODS.map((item) => (
            <button
              aria-pressed={period === item.id}
              className={`button button-light${period === item.id ? " active" : ""}`}
              key={item.id}
              onClick={() => choosePeriod(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <DateRangePicker
            ariaLabel="Elegir fechas del dashboard"
            className={`admin-dashboard-range${isCustom ? " is-active" : ""}`}
            from={isCustom ? customRange.from : ""}
            max={toIsoDate(new Date())}
            onChange={chooseCustomRange}
            placeholder="Elegir fechas"
            to={isCustom ? customRange.to : ""}
          />
        </div>
        <p className="admin-dashboard-scope">Sucursal: <strong>{selectedBranch.name}</strong> · Período: <strong>{periodName}</strong></p>
      </div>

      <div className={`admin-dash-top${periodChanges ? " is-period-swap" : ""}`} key={`top-${animateKey}`}>
        <Link className="card admin-dash-card admin-dash-sales" href={detailLink("day-history")}>
          <small>Ventas {ranges.periodLabel}</small>
          <strong><CountUp animateKey={animateKey} format={formatPrice} value={totalCents} /></strong>
          <span className="admin-dash-sales-meta">
            <CountUp animateKey={animateKey} format={String} value={current.length} /> {current.length === 1 ? "venta" : "ventas"} · ticket promedio <CountUp animateKey={animateKey} format={formatPrice} value={averageCents} />
          </span>
          <span className={`admin-dash-change${change === null ? "" : change >= 0 ? " is-up" : " is-down"}`}>
            {change === null
              ? `${ranges.previousName}: sin ventas para comparar`
              : `${change >= 0 ? "+" : ""}${change}% ${ranges.compareLabel}`}
          </span>
        </Link>
        <Link className="card admin-dash-card admin-dash-mini" href={detailLink("out-stock")}>
          <small>Stock</small>
          <strong><CountUp animateKey={animateKey} format={String} value={zeroStockCount} /> <em>sin stock</em></strong>
          <span>{lowStockCount} con stock bajo · ver y sumar stock</span>
        </Link>
        <Link className="card admin-dash-card admin-dash-mini" href={detailLink("pending-orders")}>
          <small>Pedidos web pendientes</small>
          <strong><CountUp animateKey={animateKey} format={String} value={pendingCount} /></strong>
          <span>{pendingCount === 1 ? "Pedido en curso" : "Pedidos en curso"} · ver y cerrar</span>
        </Link>
      </div>

      <div className={`admin-dash-grid${periodChanges ? " is-period-swap" : ""}`} key={`grid-${animateKey}`}>
        <section className={`card admin-panel admin-dash-card admin-dash-days${days.length > 10 ? " is-month" : ""}`}>
          <header className="admin-dash-card-head">
            <h2>Ventas por día</h2>
            <p>{isCustom ? ranges.periodLabel : period === "month" ? "Días de este mes" : "Últimos 7 días"} · {selectedBranch.name}</p>
          </header>
          <ul className={`admin-day-bars${days.length > 10 ? " is-dense" : ""}`} style={{ "--day-rows": Math.ceil(days.length / 3) } as CSSProperties}>
            {days.map((day) => (
              <li key={day.key}>
                <span className="admin-day-label">{day.label}</span>
                <span className="admin-day-track" aria-hidden="true">
                  {day.cents > 0 ? <span className="admin-day-fill" style={{ width: `${Math.max(3, Math.round((day.cents / maxDay) * 100))}%` }} /> : null}
                </span>
                <strong className={day.cents ? "" : "is-zero"}>{formatPrice(day.cents)}</strong>
              </li>
            ))}
          </ul>
        </section>
        <ShareCard
          description={`Mostrador (Caja) contra tienda online · ${periodName}`}
          emptyText={emptyText}
          rows={channelRows}
          title="¿Por dónde vendés?"
        />
        <ShareCard
          description={`Medio de pago de cada venta · ${periodName}`}
          emptyText={emptyText}
          rows={paymentRows}
          title="¿Cómo te pagan?"
        />
        <section className="card admin-panel admin-dash-card">
          <header className="admin-dash-card-head">
            <h2>Comparación de sucursales</h2>
            <p>Ventas de cada sucursal · {periodName}</p>
          </header>
          {branchTotal ? (
            <ul className="admin-share-list">
              {branchRows.map((row) => (
                <li className={row.branch.id === selectedBranch.id ? "is-current" : ""} key={row.branch.id}>
                  <span className="admin-share-name">{row.branch.name}{row.branch.id === selectedBranch.id ? " (activa)" : ""}</span>
                  <strong>{formatPrice(row.cents)}</strong>
                  <small>{Math.round((row.cents / branchTotal) * 100)}%</small>
                </li>
              ))}
            </ul>
          ) : <p className="admin-dash-empty">{emptyText}</p>}
          <Link className="admin-dash-link" href={detailLink("branch-stock")}>Ver stock por sucursal <ChevronRight size={15} /></Link>
        </section>
      </div>
    </>
  );
}

export function DashboardSection({
  basePath,
  branches,
  lowStockCount,
  orders,
  pendingCount,
  selectedBranch,
  zeroStockCount,
}: {
  basePath: string;
  branches: Branch[];
  lowStockCount: number;
  orders: OrderRecord[];
  pendingCount: number;
  selectedBranch: Branch;
  zeroStockCount: number;
}) {
  return (
    <>
    <SectionHeader subtitle="Cómo vienen las ventas, el stock y los pedidos de la sucursal activa" title="Dashboard" />
    <DashboardOverview
      basePath={basePath}
      branches={branches}
      lowStockCount={lowStockCount}
      orders={orders}
      pendingCount={pendingCount}
      selectedBranch={selectedBranch}
      zeroStockCount={zeroStockCount}
    />
    </>
  );
}
