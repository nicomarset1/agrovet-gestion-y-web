"use client";

// Panel de gestión: sección Ventas web.

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Branch, OrderRecord } from "@/lib/types";
import { PendingOrderCard, SectionHeader, StatCard, isReservedWebOrder, isAwaitingOnlinePayment, isCancelledOrder, isCancelledWebOrder, isCompletedWebOrder, isDeliveryWebOrder, isPendingWebOrder, isPickupWebOrder, isWebOrder, orderHasBranch, periodBounds, toDate } from "@/components/admin/shared";
import type { Period, WebOrderStatus } from "@/components/admin/shared";

const WEB_PERIOD_STORAGE_KEY = "agrovet-web-period";

export function VentasWebSection({
  branches,
  onEditDistribution,
  onEditOrder,
  onStatusTarget,
  orders,
  returnTo,
}: {
  branches: Branch[];
  onEditDistribution: (order: OrderRecord) => void;
  onEditOrder: (order: OrderRecord) => void;
  onStatusTarget: (target: { order: OrderRecord; status: WebOrderStatus }) => void;
  orders: OrderRecord[];
  returnTo: string;
}) {
  const [webPeriod, setWebPeriod] = useState<Period>("day");
  const webPeriodStorageReady = useRef(false);
  const [webHistoryStatusFilter, setWebHistoryStatusFilter] = useState<"all" | "done" | "cancelled">("all");
  const [webHistoryTypeFilter, setWebHistoryTypeFilter] = useState<"all" | "retiro" | "envio">("all");
  const webOrders = orders.filter((order) => isWebOrder(order));
  const webPeriodRange = periodBounds(webPeriod, new Date());
  const webPeriodOrders = webOrders.filter((order) => {
    const orderDate = toDate(order.createdAt);
    return orderDate >= webPeriodRange.start && orderDate < webPeriodRange.end;
  });
  const webPeriodBillableOrders = webPeriodOrders.filter((order) => !isCancelledOrder(order) && !isAwaitingOnlinePayment(order));
  const webOrdersTotal = webPeriodBillableOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const webOrdersActive = webPeriodOrders.filter((order) => !isCancelledWebOrder(order) && !isAwaitingOnlinePayment(order));
  const webOrdersPending = webPeriodOrders.filter((order) => isPendingWebOrder(order));
  const webOrdersCompleted = webPeriodBillableOrders.filter((order) => isCompletedWebOrder(order));
  const webOpenOrders = webOrders.filter((order) => isPendingWebOrder(order));
  // Reservados de todas las fechas (duran como mucho 12 h), del más próximo a vencer al más nuevo.
  const webReservedOrders = webOrders.filter((order) => isReservedWebOrder(order))
    .sort((a, b) => (a.reservedUntil ?? a.createdAt).localeCompare(b.reservedUntil ?? b.createdAt));
  const webPickupOrders = webOpenOrders.filter((order) => isPickupWebOrder(order));
  const webDeliveryOrders = webOpenOrders.filter((order) => isDeliveryWebOrder(order));
  const webHistoryOrders = [...webPeriodOrders].filter((order) => {
    if (isPendingWebOrder(order)) return false;
    if (isAwaitingOnlinePayment(order)) return false;
    if (webHistoryStatusFilter === "done" && !isCompletedWebOrder(order)) return false;
    if (webHistoryStatusFilter === "cancelled" && !isCancelledWebOrder(order)) return false;
    if (webHistoryTypeFilter === "retiro" && !isPickupWebOrder(order)) return false;
    if (webHistoryTypeFilter === "envio" && !isDeliveryWebOrder(order)) return false;
    return true;
  }).sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());

  useEffect(() => {
    const stored = window.localStorage.getItem(WEB_PERIOD_STORAGE_KEY);
    queueMicrotask(() => {
      webPeriodStorageReady.current = true;
      if (stored === "day" || stored === "week" || stored === "month" || stored === "year") setWebPeriod(stored);
    });
  }, []);

  useEffect(() => {
    if (!webPeriodStorageReady.current) return;
    window.localStorage.setItem(WEB_PERIOD_STORAGE_KEY, webPeriod);
  }, [webPeriod]);

  return (
    <>
    <div id="admin-section-ventas-web">
    <SectionHeader
      action={(
        <div className="admin-period-toggle" role="group" aria-label="Período de ventas web">
          <button
            aria-pressed={webPeriod === "day"}
            className={`button button-light${webPeriod === "day" ? " active" : ""}`}
            onClick={() => setWebPeriod("day")}
            type="button"
          >
            Día
          </button>
          <button
            aria-pressed={webPeriod === "week"}
            className={`button button-light${webPeriod === "week" ? " active" : ""}`}
            onClick={() => setWebPeriod("week")}
            type="button"
          >
            Semana
          </button>
          <button
            aria-pressed={webPeriod === "month"}
            className={`button button-light${webPeriod === "month" ? " active" : ""}`}
            onClick={() => setWebPeriod("month")}
            type="button"
          >
            Mes
          </button>
          <button
            aria-pressed={webPeriod === "year"}
            className={`button button-light${webPeriod === "year" ? " active" : ""}`}
            onClick={() => setWebPeriod("year")}
            type="button"
          >
            Año
          </button>
        </div>
      )}
      subtitle="Historial general de pedidos web"
      title="Ventas web"
    />
    <div className="admin-stat-grid">
      <StatCard label="Ingresos web" value={formatPrice(webOrdersTotal)} note="Pedidos del período seleccionado" />
      <StatCard label="Pedidos web" value={String(webOrdersActive.length)} note="Incluye retiros y envíos activos" />
      <StatCard label="Pendientes" value={String(webOrdersPending.length)} note="Pedidos abiertos sin cerrar" />
      <StatCard label="Cerrados" value={String(webOrdersCompleted.length)} note="Retirados o entregados" />
    </div>
    <div className="admin-web-queue-grid">
      {webReservedOrders.length ? (
        <section className="card admin-panel admin-span-2 admin-reserved-panel" aria-labelledby="admin-reserved-title">
          <div className="admin-reserved-head">
            <h2 id="admin-reserved-title">Reservados (esperando pago)</h2>
            <span className="admin-reserved-count">{webReservedOrders.length}</span>
          </div>
          <p className="description">Pagos con Mercado Pago en curso. El stock ya está descontado mientras el cliente paga; si no paga en 12 h, vuelve solo. Todavía no suman a ingresos.</p>
          <div className="admin-web-history-list">
            {webReservedOrders.map((order) => (
              <PendingOrderCard
                key={order.id}
                onCancelOrder={(nextOrder) => onStatusTarget({ order: nextOrder, status: "Cancelado" })}
                onSelectOrder={onEditOrder}
                order={order}
                returnTo={returnTo}
                showStatusActions
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="card admin-panel">
        <h2>Retiros en sucursal</h2>
        <p className="description">Pedidos web pendientes para retirar. Al cerrar uno, elegí el medio de pago.</p>
        <div className="admin-web-branch-grid">
          {branches.map((branch) => {
            const branchOrders = webPickupOrders.filter((order) => orderHasBranch(order, branch.id));
            return (
              <div className="admin-web-branch-column" key={branch.id}>
                <div className="admin-web-branch-head">
                  <strong>{branch.name}</strong>
                  <span>{branchOrders.length} pedidos</span>
                </div>
                <div className="admin-web-branch-body open">
                  {branchOrders.length ? branchOrders.map((order) => (
                    <PendingOrderCard
                      key={`${order.id}-${branch.id}`}
                      onCompleteOrder={(nextOrder, status) => onStatusTarget({ order: nextOrder, status })}
                      onCancelOrder={(nextOrder) => onStatusTarget({ order: nextOrder, status: "Cancelado" })}
                      onEditDistribution={(nextOrder) => onEditDistribution(nextOrder)}
                      onSelectOrder={onEditOrder}
                      branchId={branch.id}
                      order={order}
                      returnTo={returnTo}
                      showStatusActions
                    />
                  )) : <p className="description">Sin pedidos pendientes.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card admin-panel">
        <h2>Envíos gratis</h2>
        <p className="description">Pedidos web con entrega sin cargo. Podés cambiar qué sucursal descuenta cada producto.</p>
        <div className="admin-web-branch-grid">
          {branches.map((branch) => {
            const branchOrders = webDeliveryOrders.filter((order) => orderHasBranch(order, branch.id));
            return (
              <div className="admin-web-branch-column" key={branch.id}>
                <div className="admin-web-branch-head">
                  <strong>{branch.name}</strong>
                  <span>{branchOrders.length} pedidos</span>
                </div>
                <div className="admin-web-branch-body open">
                  {branchOrders.length ? branchOrders.map((order) => (
                    <PendingOrderCard
                      key={`${order.id}-${branch.id}`}
                      onCompleteOrder={(nextOrder, status) => onStatusTarget({ order: nextOrder, status })}
                      onCancelOrder={(nextOrder) => onStatusTarget({ order: nextOrder, status: "Cancelado" })}
                      onEditDistribution={(nextOrder) => onEditDistribution(nextOrder)}
                      onSelectOrder={onEditOrder}
                      branchId={branch.id}
                      order={order}
                      returnTo={returnTo}
                      showStatusActions
                    />
                  )) : <p className="description">Sin envíos activos.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card admin-panel admin-span-2">
        <h2>Historial web</h2>
        <p className="description">Todos los pedidos web del período seleccionado, abiertos y cerrados.</p>
        <div className="admin-web-filters">
          <div className="admin-web-filter-group">
            <span>Estado</span>
            <div className="admin-web-filter-pills">
              <button className={`choice-card${webHistoryStatusFilter === "all" ? " active" : ""}`} onClick={() => setWebHistoryStatusFilter("all")} type="button">Todo</button>
              <button className={`choice-card${webHistoryStatusFilter === "done" ? " active" : ""}`} onClick={() => setWebHistoryStatusFilter("done")} type="button">Terminados</button>
              <button className={`choice-card${webHistoryStatusFilter === "cancelled" ? " active" : ""}`} onClick={() => setWebHistoryStatusFilter("cancelled")} type="button">Cancelados</button>
            </div>
          </div>
          <div className="admin-web-filter-group">
            <span>Tipo</span>
            <div className="admin-web-filter-pills">
              <button className={`choice-card${webHistoryTypeFilter === "all" ? " active" : ""}`} onClick={() => setWebHistoryTypeFilter("all")} type="button">Todo</button>
              <button className={`choice-card${webHistoryTypeFilter === "retiro" ? " active" : ""}`} onClick={() => setWebHistoryTypeFilter("retiro")} type="button">Retiro</button>
              <button className={`choice-card${webHistoryTypeFilter === "envio" ? " active" : ""}`} onClick={() => setWebHistoryTypeFilter("envio")} type="button">Envío</button>
            </div>
          </div>
        </div>
        <div className="admin-web-history-list">
          {webHistoryOrders.length ? webHistoryOrders.map((order) => (
            <PendingOrderCard
              key={order.id}
              onSelectOrder={onEditOrder}
              order={order}
              returnTo={returnTo}
              showStatusActions={false}
            />
          )) : <p className="description">No hay pedidos web para el período seleccionado.</p>}
        </div>
      </section>
    </div>
    </div>
    </>
  );
}
