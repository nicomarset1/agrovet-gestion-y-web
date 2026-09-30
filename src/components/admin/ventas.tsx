"use client";

// Panel de gestión: sección Ventas.

import Link from "next/link";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Branch, OrderRecord } from "@/lib/types";
import { SectionHeader, dateKey, formatAdminDateTime, getOrderBranchRevenueCents, isAwaitingOnlinePayment, isCancelledOrder, monthKey, orderHasBranch, toDate } from "@/components/admin/shared";
import type { DashboardDetail } from "@/components/admin/shared";

export function VentasSection({
  branches,
  detailHref,
  onDeleteOrder,
  onEditOrder,
  orders,
  pendingCount,
  selectedBranch,
}: {
  branches: Branch[];
  detailHref: (target: DashboardDetail["type"]) => string;
  onDeleteOrder: (order: OrderRecord) => void;
  onEditOrder: (order: OrderRecord) => void;
  orders: OrderRecord[];
  pendingCount: number;
  selectedBranch: Branch;
}) {
  const [billingDate, setBillingDate] = useState(dateKey(new Date()));
  const [reportMonth, setReportMonth] = useState(monthKey(new Date()));
  const [reportBranch, setReportBranch] = useState(() => selectedBranch.id ? String(selectedBranch.id) : "all");
  const [reportChannel, setReportChannel] = useState("all");
  const [reportPayment, setReportPayment] = useState("all");
  const billingOrders = orders.filter((order) => !isCancelledOrder(order) && !isAwaitingOnlinePayment(order) && dateKey(toDate(order.createdAt)) === billingDate && orderHasBranch(order, selectedBranch.id));
  const billingTotal = billingOrders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranch.id), 0);

  return (
    <>
    <div id="admin-section-ventas">
    <SectionHeader subtitle="Registro de ventas y seguimiento de pedidos" title="Ventas" />
    <div className="admin-sales-grid">
      <section className="card admin-panel">
        <Link className="admin-title-button" href={detailHref("day-billing")}>
          <h2>Registro de facturación</h2>
          <ChevronRight size={18} />
        </Link>
        <div className="admin-toolbar admin-toolbar-stack">
          <label className="admin-point-field">
            <span>Buscar por fecha</span>
            <input className="field" onChange={(event) => setBillingDate(event.target.value)} type="date" value={billingDate} />
          </label>
          <div className="admin-detail-summary compact">
            <strong>{formatPrice(billingTotal)}</strong>
            <span>{billingOrders.length} ventas en {selectedBranch.name}</span>
          </div>
        </div>
        <div className="admin-sale-list">
          {billingOrders.length === 0 ? <p className="description">No hay pedidos para esa fecha en esta sucursal.</p> : billingOrders.map((order) => (
            <div className="admin-table-row compact" key={order.id}>
              <div>
                <strong>{order.code}</strong>
                <small>{order.customerName} | {selectedBranch.name} | {formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</small>
              </div>
              <div className="admin-row-actions">
                <span className="admin-stock-pill">{formatPrice(getOrderBranchRevenueCents(order, selectedBranch.id))} | {order.status}</span>
                <button aria-label={`Editar venta ${order.code}`} className="icon-button" onClick={() => onEditOrder(order)} type="button"><Pencil size={16} /></button>
                <button aria-label={`Eliminar venta ${order.code}`} className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="card admin-panel">
        <h2>Pedidos pendientes</h2>
        <p className="description">Control de pedidos abiertos con seguimiento de retiro y envío.</p>
        <div className="notice">{pendingCount} pedidos activos.</div>
      </section>
      <section className="card admin-panel admin-span-2">
        <div className="admin-donut-card-head">
          <div>
            <h2>Descargar registro</h2>
            <p className="description">Filtra por mes, sucursal, canal y medio de pago antes de exportar.</p>
          </div>
          <a
            className="button button-primary"
            href={`/api/admin/reports/sales?month=${encodeURIComponent(reportMonth)}&branch=${encodeURIComponent(reportBranch)}&channel=${encodeURIComponent(reportChannel)}&payment=${encodeURIComponent(reportPayment)}`}
          >
            Descargar registro
          </a>
        </div>
        <div className="admin-toolbar admin-toolbar-stack">
          <label className="admin-point-field">
            <span>Mes</span>
            <input className="field" onChange={(event) => setReportMonth(event.target.value)} type="month" value={reportMonth} />
          </label>
          <label className="admin-point-field">
            <span>Sucursal</span>
            <select className="field" onChange={(event) => setReportBranch(event.target.value)} value={reportBranch}>
              <option value="all">Todas</option>
              {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
            </select>
          </label>
          <label className="admin-point-field">
            <span>Canal</span>
            <select className="field" onChange={(event) => setReportChannel(event.target.value)} value={reportChannel}>
              <option value="all">Todos</option>
              <option value="web">Tienda online</option>
              <option value="store">Caja</option>
              <option value="wholesale">Mayorista</option>
            </select>
          </label>
          <label className="admin-point-field">
            <span>Pago</span>
            <select className="field" onChange={(event) => setReportPayment(event.target.value)} value={reportPayment}>
              <option value="all">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="qr">QR</option>
            </select>
          </label>
        </div>
      </section>
    </div>
    </div>
    </>
  );
}
