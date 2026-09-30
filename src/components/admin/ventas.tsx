"use client";

// Panel de gestión: sección Ventas. Un solo listado con filtros (fechas, sucursal, canal y medio de
// pago), resumen del período, tabla ordenable con páginas de 50 y el PDF con exactamente lo filtrado.

import { ArrowDown, ArrowUp, Download, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { Select } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatRange, startOfMonth, toIsoDate } from "@/components/ui/date-utils";
import type { Branch, OrderRecord } from "@/lib/types";
import {
  SectionHeader,
  dateKey,
  formatAdminDateTime,
  getOrderBranchName,
  getOrderBranchRevenueCents,
  isAwaitingOnlinePayment,
  isCancelledOrder,
  orderHasBranch,
  toDate,
} from "@/components/admin/shared";

const PAGE_SIZE = 50;

type SalesChannel = "all" | "store" | "web" | "wholesale";
type SortKey = "date" | "code" | "customer" | "channel" | "payment" | "branch" | "total" | "status";

// Mismos valores que el reporte PDF (parsePayment en /api/admin/reports/sales).
const PAYMENT_FILTERS = [
  { value: "all", label: "Todos los medios" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "qr", label: "QR" },
  { value: "web", label: "Tienda online" },
  { value: "mayorista", label: "Mayorista" },
];

function paymentKey(order: OrderRecord) {
  const match = /Caja \/ ([^(]+)(?: \((\d+) cuotas\))?/i.exec(order.source);
  if (match) return match[1].trim().toLowerCase();
  if (order.source.toLowerCase().includes("mayorista")) return "mayorista";
  return order.source.toLowerCase().includes("tienda online") ? "web" : "otro";
}

function paymentLabel(order: OrderRecord) {
  const cash = /Caja \/ (.+)$/i.exec(order.source);
  if (cash) return cash[1].trim();
  if (/^Mayorista\b/i.test(order.source)) return order.paymentMethod || "Mayorista";
  return order.paymentMethod || "Tienda online";
}

function channelOf(order: OrderRecord): Exclude<SalesChannel, "all"> {
  const source = order.source.toLowerCase();
  if (source.includes("caja")) return "store";
  if (source.includes("mayorista")) return "wholesale";
  return "web";
}

const CHANNEL_LABEL: Record<Exclude<SalesChannel, "all">, string> = { store: "Mostrador", web: "Tienda online", wholesale: "Mayorista" };

export function VentasSection({
  branches,
  onDeleteOrder,
  onEditOrder,
  orders,
  selectedBranch,
}: {
  branches: Branch[];
  onDeleteOrder: (order: OrderRecord) => void;
  onEditOrder: (order: OrderRecord) => void;
  orders: OrderRecord[];
  selectedBranch: Branch;
}) {
  const todayIso = toIsoDate(new Date());
  const [from, setFrom] = useState(() => toIsoDate(startOfMonth(new Date())));
  const [to, setTo] = useState(todayIso);
  const [branchFilter, setBranchFilter] = useState(() => String(selectedBranch.id));
  const [channel, setChannel] = useState<SalesChannel>("all");
  const [payment, setPayment] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(1);

  const branchId = branchFilter === "all" ? null : Number(branchFilter);
  const amountFor = (order: OrderRecord) => (branchId ? getOrderBranchRevenueCents(order, branchId) : order.totalCents);

  // Igual que el reporte: sin cancelados ni pedidos sin cobrar (reservados o esperando pago).
  const filtered = useMemo(() => orders.filter((order) => {
    if (isCancelledOrder(order) || isAwaitingOnlinePayment(order)) return false;
    const key = dateKey(toDate(order.createdAt));
    if (key < from || key > to) return false;
    if (branchId && !orderHasBranch(order, branchId)) return false;
    if (channel !== "all" && channelOf(order) !== channel) return false;
    if (payment !== "all" && paymentKey(order) !== payment) return false;
    return true;
  }), [branchId, channel, from, orders, payment, to]);

  const sorted = useMemo(() => {
    const value = (order: OrderRecord): string | number => {
      switch (sort.key) {
        case "date": return toDate(order.createdAt).getTime();
        case "code": return order.code;
        case "customer": return order.customerName.toLowerCase();
        case "channel": return CHANNEL_LABEL[channelOf(order)];
        case "payment": return paymentLabel(order).toLowerCase();
        case "branch": return getOrderBranchName(order);
        case "total": return branchId ? getOrderBranchRevenueCents(order, branchId) : order.totalCents;
        case "status": return order.status;
      }
    };
    return [...filtered].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "es");
      return result * sort.dir;
    });
  }, [branchId, filtered, sort]);

  const totalCents = filtered.reduce((sum, order) => sum + amountFor(order), 0);
  const averageCents = filtered.length ? Math.round(totalCents / filtered.length) : 0;
  const byPayment = new Map<string, number>();
  for (const order of filtered) {
    const label = paymentLabel(order).replace(/ \(\d+ cuotas\)$/, "");
    byPayment.set(label, (byPayment.get(label) ?? 0) + amountFor(order));
  }
  const paymentBreakdown = [...byPayment.entries()].sort((a, b) => b[1] - a[1]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstRow = sorted.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(currentPage * PAGE_SIZE, sorted.length);

  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "date" || key === "total" ? -1 : 1 }));
    resetPage();
  };
  const periodLabel = formatRange(from, to);
  const branchLabel = branchId ? branches.find((branch) => branch.id === branchId)?.name ?? "Sucursal" : "Todas las sucursales";
  const reportHref = `/api/admin/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&branch=${encodeURIComponent(branchFilter)}&channel=${encodeURIComponent(channel)}&payment=${encodeURIComponent(payment)}`;

  const header = (key: SortKey, label: string, align?: "end") => {
    const active = sort.key === key;
    return (
      <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={align === "end" ? "is-end" : undefined} scope="col">
        <button className={`admin-sort${active ? " is-active" : ""}`} onClick={() => toggleSort(key)} type="button">
          {label}
          {active ? (sort.dir === 1 ? <ArrowUp aria-hidden="true" size={13} /> : <ArrowDown aria-hidden="true" size={13} />) : null}
        </button>
      </th>
    );
  };

  return (
    <div id="admin-section-ventas">
      <SectionHeader
        action={(
          <a className="button button-primary" href={reportHref}>
            <Download size={16} /> Descargar PDF
          </a>
        )}
        subtitle="Todas las ventas del período: mostrador, tienda online y mayoristas"
        title="Ventas"
      />

      <div className="admin-toolbar admin-sales-filters">
        <DateRangePicker
          ariaLabel="Período de ventas"
          clearable={false}
          from={from}
          max={todayIso}
          onChange={(nextFrom, nextTo) => {
            if (!nextFrom || !nextTo) return;
            setFrom(nextFrom);
            setTo(nextTo);
            resetPage();
          }}
          to={to}
        />
        <Select
          ariaLabel="Sucursal"
          onChange={(value) => { setBranchFilter(value); resetPage(); }}
          options={[{ value: "all", label: "Todas las sucursales" }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]}
          value={branchFilter}
        />
        <Select
          ariaLabel="Canal"
          onChange={(value) => { setChannel(value as SalesChannel); resetPage(); }}
          options={[
            { value: "all", label: "Todos los canales" },
            { value: "store", label: "Mostrador (Caja)" },
            { value: "web", label: "Tienda online" },
            { value: "wholesale", label: "Mayorista" },
          ]}
          value={channel}
        />
        <Select
          ariaLabel="Medio de pago"
          onChange={(value) => { setPayment(value); resetPage(); }}
          options={PAYMENT_FILTERS}
          value={payment}
        />
      </div>

      <section className="card admin-panel admin-sales-summary" aria-label="Resumen del período">
        <div className="admin-sales-kpis">
          <div>
            <small>Total</small>
            <strong>{formatPrice(totalCents)}</strong>
          </div>
          <div>
            <small>Ventas</small>
            <strong>{filtered.length}</strong>
          </div>
          <div>
            <small>Ticket promedio</small>
            <strong>{formatPrice(averageCents)}</strong>
          </div>
        </div>
        <div className="admin-sales-breakdown">
          <small>{periodLabel} · {branchLabel}</small>
          {paymentBreakdown.length ? (
            <ul>
              {paymentBreakdown.map(([label, cents]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{formatPrice(cents)}</strong>
                  <small>{totalCents ? Math.round((cents / totalCents) * 100) : 0}%</small>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="card admin-panel admin-sales-table-wrap">
        {sorted.length ? (
          <>
            <div className="admin-sales-scroll">
              <table className="admin-sales-table">
                <thead>
                  <tr>
                    {header("date", "Fecha")}
                    {header("code", "Código")}
                    {header("customer", "Cliente")}
                    {header("channel", "Canal")}
                    {header("payment", "Medio")}
                    {header("branch", "Sucursal")}
                    {header("total", "Total", "end")}
                    {header("status", "Estado")}
                    <th className="is-end" scope="col"><span className="admin-sort-static">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((order) => (
                    <tr key={order.id}>
                      <td className="is-date">{formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="is-code">{order.code}</td>
                      <td className="is-customer" title={order.customerName}>{order.customerName}</td>
                      <td className="is-channel">{CHANNEL_LABEL[channelOf(order)]}</td>
                      <td className="is-payment" title={paymentLabel(order)}>{paymentLabel(order)}</td>
                      <td className="is-branch">{getOrderBranchName(order)}</td>
                      <td className="is-end is-total">{formatPrice(amountFor(order))}</td>
                      <td className="is-status"><span className="admin-sales-status">{order.status}</span></td>
                      <td className="is-end is-actions">
                        <div className="admin-row-actions">
                          <button aria-label={`Ver o editar venta ${order.code}`} className="icon-button" onClick={() => onEditOrder(order)} type="button"><Pencil size={15} /></button>
                          <button aria-label={`Eliminar venta ${order.code}`} className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-pager">
              <span>Mostrando {firstRow}–{lastRow} de {sorted.length} ventas</span>
              {pageCount > 1 ? (
                <div className="admin-pager-buttons">
                  <button className="button button-light" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">Anterior</button>
                  <span aria-live="polite">Página {currentPage} de {pageCount}</span>
                  <button className="button button-light" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">Siguiente</button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="admin-dash-empty">No hay ventas con esos filtros en {periodLabel}.</p>
        )}
      </section>
    </div>
  );
}
