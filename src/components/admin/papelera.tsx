"use client";

// Panel de gestión: sección Papelera.

import { Search, Trash2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { TrashItem } from "@/lib/types";
import { restoreTrashItemAction, emptyTrashAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, StatCard, formatAdminDateTime, trashDaysUntilPurge, trashTypeLabel, trashTypeSingular } from "@/components/admin/shared";

export function RestoreTrashItemModal({
  item,
  onClose,
  returnTo,
}: {
  item: TrashItem;
  onClose: () => void;
  returnTo: string;
}) {
  const label = trashTypeSingular(item.type);
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle="Confirmación antes de restaurar."
      title={`Restaurar ${label}`}
      zIndex={240}
    >
      <div className="admin-confirm-visual">
        <div className="admin-confirm-icon">
          <RotateCcw size={24} />
        </div>
        <div className="admin-confirm-copy">
          <strong>{item.title}</strong>
          <span>{trashTypeLabel(item.type)} | {item.subtitle}</span>
        </div>
      </div>
      <p className="admin-confirm-text">
        Vas a restaurar este {label} con el mismo estado que tenía antes de eliminarse. Si es un pedido, solo continuará si hay stock suficiente para reservarlo.
      </p>
      {item.amountCents > 0 ? (
        <div className="admin-detail-summary compact">
          <strong>{formatPrice(item.amountCents)}</strong>
          <span>{item.status}</span>
        </div>
      ) : null}
      <form
        action={restoreTrashItemAction}
        className="admin-confirm-form"
        onSubmit={() => {
          onClose();
        }}
      >
        <input name="type" type="hidden" value={item.type} />
        <input name="id" type="hidden" value={String(item.id)} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit"><RotateCcw size={16} /> Restaurar</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function EmptyTrashModal({
  count,
  onClose,
  returnTo,
}: {
  count: number;
  onClose: () => void;
  returnTo: string;
}) {
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle="Confirmación antes de borrar permanentemente."
      title="Vaciar papelera"
      zIndex={240}
    >
      <div className="admin-confirm-visual">
        <div className="admin-confirm-icon">
          <Trash2 size={24} />
        </div>
        <div className="admin-confirm-copy">
          <strong>{count} {count === 1 ? "elemento" : "elementos"}</strong>
          <span>Esta acción limpia la papelera de forma permanente.</span>
        </div>
      </div>
      <p className="admin-confirm-text">
        Los pedidos eliminados se borrarán de la papelera sin tocar stock nuevamente. Los productos con historial de ventas dejarán de aparecer en papelera, pero conservarán las referencias necesarias para reportes anteriores.
      </p>
      <form
        action={emptyTrashAction}
        className="admin-confirm-form"
        onSubmit={() => {
          onClose();
        }}
      >
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary danger" type="submit"><Trash2 size={16} /> Vaciar papelera</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function PapeleraSection({
  onEmptyTrash,
  onRestore,
  trashItems,
}: {
  onEmptyTrash: () => void;
  onRestore: (item: TrashItem) => void;
  trashItems: TrashItem[];
}) {
  const [trashQuery, setTrashQuery] = useState("");
  const [trashTypeFilter, setTrashTypeFilter] = useState<TrashItem["type"] | "all">("all");
  const filteredTrashItems = useMemo(() => {
    const query = trashQuery.trim().toLowerCase();
    return trashItems.filter((item) => {
      const matchesType = trashTypeFilter === "all" || item.type === trashTypeFilter;
      const matchesQuery = !query || `${trashTypeLabel(item.type)} ${item.title} ${item.subtitle} ${item.status} ${item.source}`.toLowerCase().includes(query);
      return matchesType && matchesQuery;
    });
  }, [trashItems, trashQuery, trashTypeFilter]);
  return (
    <>
    <div id="admin-section-papelera">
    <SectionHeader
      action={(
        <button className="button button-light danger" disabled={!trashItems.length} onClick={onEmptyTrash} type="button">
          <Trash2 size={16} /> Vaciar papelera
        </button>
      )}
      subtitle="Elementos eliminados del panel. Restaurar un pedido vuelve a reservar stock si hay unidades suficientes."
      title="Papelera"
    />
    <div className="admin-stat-grid admin-trash-stats">
      <StatCard label="Total" value={String(trashItems.length)} note="Elementos en papelera" />
      <StatCard label="Pedidos" value={String(trashItems.filter((item) => item.type === "order").length)} note="Restauran stock al volver" />
      <StatCard label="Productos" value={String(trashItems.filter((item) => item.type === "product").length)} note="Conservan variantes y stock" />
    </div>
    <section className="card admin-panel">
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={18} />
          <input className="field" onChange={(event) => setTrashQuery(event.target.value)} placeholder="Buscar en papelera..." value={trashQuery} />
        </label>
        <label className="admin-point-field">
          <span>Tipo</span>
          <select className="field" onChange={(event) => setTrashTypeFilter(event.target.value as TrashItem["type"] | "all")} value={trashTypeFilter}>
            <option value="all">Todo</option>
            <option value="order">Pedidos</option>
            <option value="product">Productos</option>
            <option value="category">Categorías</option>
            <option value="subcategory">Subcategorías</option>
            <option value="client">Clientes</option>
          </select>
        </label>
      </div>
      <div className="admin-product-list admin-trash-list">
        {filteredTrashItems.length ? filteredTrashItems.map((item) => {
          const daysLeft = trashDaysUntilPurge(item.deletedAt);
          return (
            <div className="admin-table-row compact" key={`${item.type}-${item.id}`}>
              <div>
                <strong>{item.title}</strong>
                <small>{trashTypeLabel(item.type)} | {item.subtitle} | {item.status} | {formatAdminDateTime(item.deletedAt, { dateStyle: "short", timeStyle: "short" })}</small>
                {item.type === "order" && item.refundMethod ? (
                  <small>Devolución: {item.refundMethod}{item.refundNote ? ` | ${item.refundNote}` : ""}</small>
                ) : null}
              </div>
              <div className="admin-row-actions">
                <span className={`admin-stock-pill ${daysLeft === 0 ? "danger" : ""}`}>
                  {daysLeft === 1 ? "1 día restante" : `${daysLeft ?? 0} días restantes`}
                </span>
                {item.amountCents > 0 ? <span className="admin-stock-pill">{formatPrice(item.amountCents)}</span> : null}
                <button className="button button-light" onClick={() => onRestore(item)} type="button"><RotateCcw size={16} /> Restaurar</button>
              </div>
            </div>
          );
        }) : <p className="description">No hay elementos para esos filtros.</p>}
      </div>
    </section>
    </div>
    </>
  );
}
