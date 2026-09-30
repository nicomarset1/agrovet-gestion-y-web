"use client";

// Panel de gestión: sección Papelera.

import { AlertTriangle, Info, Search, Trash2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { Select } from "@/components/ui/select";
import type { TrashItem } from "@/lib/types";
import { restoreTrashItemAction, emptyTrashAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, StatCard, formatAdminDateTime, toDate, trashDaysUntilPurge, trashTypeLabel, trashTypeSingular } from "@/components/admin/shared";

const TYPE_ORDER: TrashItem["type"][] = ["order", "product", "category", "subcategory", "client"];
const PURGE_WEEK_DAYS = 7;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "hace 3 días", con la fecha completa aparte para el title. */
function relativeDeletion(deletedAt: string) {
  const minutes = Math.floor((Date.now() - toDate(deletedAt).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${plural(hours, "hora", "horas")}`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

function expiryPill(daysLeft: number | null) {
  const days = daysLeft ?? 0;
  if (days <= 0) return { tone: "is-last", text: "Se purga hoy" };
  if (days === 1) return { tone: "is-last", text: "Se purga mañana" };
  if (days <= PURGE_WEEK_DAYS) return { tone: "is-soon", text: `Se purga en ${days} días` };
  return { tone: "", text: `Quedan ${days} días` };
}

/** Qué pasa al restaurar: una línea para la fila y el modal. */
function restoreImpact(item: TrashItem): { text: string; blocked?: string[] } | null {
  const impact = item.impact;
  if (!impact) return null;
  if (item.type === "order") {
    if (impact.shortages?.length) return { text: "No hay stock para volver a reservarlo", blocked: impact.shortages };
    if (!impact.units) return null;
    return { text: `Reserva ${impact.units} u. en ${impact.branches?.join(", ") || "su sucursal"}` };
  }
  if (item.type === "category") {
    const parts: string[] = [];
    if (impact.productCount) parts.push(plural(impact.productCount, "producto", "productos"));
    if (impact.subcategoryCount) parts.push(plural(impact.subcategoryCount, "subcategoría", "subcategorías"));
    if (impact.childCount) parts.push(plural(impact.childCount, "categoría interna", "categorías internas"));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
    const base = list ? `Vuelve con ${list}` : "Vuelve sin productos";
    return { text: `${base}${impact.restoresAsRoot ? ", como categoría principal" : ""}` };
  }
  if (item.type === "subcategory") return { text: `Vuelve con ${plural(impact.productCount ?? 0, "producto", "productos")}` };
  if (item.type === "product") {
    return { text: `Conserva ${plural(impact.variantCount ?? 0, "presentación", "presentaciones")} y su stock` };
  }
  return null;
}

function PurgeRules() {
  return (
    <div className="admin-trash-rules" role="note">
      <Info aria-hidden="true" size={18} />
      <p>
        <strong>A los 30 días se borra solo.</strong> Pedidos: se eliminan definitivamente. Productos con ventas: se ocultan para siempre pero el historial de ventas los conserva. Productos sin ventas, categorías, subcategorías y clientes: se eliminan.
      </p>
    </div>
  );
}

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
  const impact = restoreImpact(item);
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
      {impact ? (
        <div className={`admin-trash-impact-box ${impact.blocked ? "is-blocked" : ""}`}>
          <strong>{impact.text}</strong>
          {impact.blocked ? (
            <ul>{impact.blocked.map((line) => <li key={line}>{line}</li>)}</ul>
          ) : null}
        </div>
      ) : null}
      <p className="admin-confirm-text">
        {impact?.blocked
          ? "Para restaurarlo, cargá stock en esa sucursal o cambiá la asignación del pedido."
          : `Vas a restaurar ${item.type === "category" || item.type === "subcategory" ? "esta" : "este"} ${label} con el mismo estado que tenía antes de eliminarse.`}
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
          <button className="button button-primary" disabled={Boolean(impact?.blocked)} type="submit"><RotateCcw size={16} /> Restaurar</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function EmptyTrashModal({
  count,
  items,
  onClose,
  returnTo,
}: {
  count: number;
  /** Con los elementos, el modal detalla qué se borra de cada tipo. */
  items?: TrashItem[];
  onClose: () => void;
  returnTo: string;
}) {
  const byType = (type: TrashItem["type"]) => items?.filter((item) => item.type === type) ?? [];
  const orphanProducts = byType("category").reduce((total, item) => total + (item.impact?.productCount ?? 0), 0);
  const deleted = (total: number) => (total === 1 ? "se elimina" : "se eliminan");
  const lines: Array<[number, string, string, string]> = items ? [
    [byType("order").length, "pedido", "pedidos", `${deleted(byType("order").length)} definitivamente`],
    [byType("product").length, "producto", "productos", byType("product").length === 1
      ? "si tiene ventas se oculta para siempre y el historial de ventas lo conserva; si no, se elimina"
      : "los que tienen ventas se ocultan para siempre y el historial de ventas los conserva; el resto se elimina"],
    [byType("category").length, "categoría", "categorías", deleted(byType("category").length)],
    [byType("subcategory").length, "subcategoría", "subcategorías", deleted(byType("subcategory").length)],
    [byType("client").length, "cliente", "clientes", deleted(byType("client").length)],
  ] : [];
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
          <strong>{plural(count, "elemento", "elementos")}</strong>
          <span>Es lo mismo que pasa solo a los 30 días, pero ahora y sin vuelta atrás.</span>
        </div>
      </div>
      {lines.some(([total]) => total > 0) ? (
        <ul className="admin-trash-empty-list">
          {lines.filter(([total]) => total > 0).map(([total, one, many, what]) => (
            <li key={one}><strong>{plural(total, one, many)}</strong>: {what}.</li>
          ))}
        </ul>
      ) : (
        <p className="admin-confirm-text">
          Pedidos: se eliminan definitivamente. Productos con ventas: se ocultan para siempre pero el historial de ventas los conserva. Productos sin ventas, categorías, subcategorías y clientes: se eliminan.
        </p>
      )}
      {orphanProducts > 0 ? (
        <div className="admin-trash-impact-box is-warn">
          <AlertTriangle aria-hidden="true" size={16} />
          <strong>{orphanProducts === 1 ? "1 producto quedará sin categoría" : `${orphanProducts} productos quedarán sin categoría`}</strong>
        </div>
      ) : null}
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

function TrashRow({ item, onRestore }: { item: TrashItem; onRestore: (item: TrashItem) => void }) {
  const pill = expiryPill(trashDaysUntilPurge(item.deletedAt));
  const impact = restoreImpact(item);
  const reasonId = `trash-reason-${item.type}-${item.id}`;
  return (
    <li className="admin-trash-row">
      <div className="admin-trash-main">
        <strong>{item.title}</strong>
        <small>
          {impact ? (
            <span className={`admin-trash-impact ${impact.blocked ? "is-blocked" : ""}`} id={reasonId}>
              {impact.blocked ? <AlertTriangle aria-hidden="true" size={13} /> : null}
              {impact.text}
            </span>
          ) : null}
          {impact ? " · " : ""}
          {item.subtitle}
          {item.amountCents > 0 ? ` | ${formatPrice(item.amountCents)}` : ""}
          {item.type === "order" && item.refundMethod ? ` | Devolución: ${item.refundMethod}${item.refundNote ? ` (${item.refundNote})` : ""}` : ""}
        </small>
      </div>
      <time className="admin-trash-when" dateTime={toDate(item.deletedAt).toISOString()} title={formatAdminDateTime(item.deletedAt, { dateStyle: "short", timeStyle: "short" })}>
        {relativeDeletion(item.deletedAt)}
      </time>
      <span className={`admin-trash-pill ${pill.tone}`}>{pill.text}</span>
      <button
        aria-describedby={impact ? reasonId : undefined}
        className="button button-light"
        disabled={Boolean(impact?.blocked)}
        onClick={() => onRestore(item)}
        type="button"
      >
        <RotateCcw size={15} /> Restaurar
      </button>
    </li>
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
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);
  const purgeThisWeek = useMemo(
    () => trashItems.filter((item) => (trashDaysUntilPurge(item.deletedAt) ?? 0) <= PURGE_WEEK_DAYS).length,
    [trashItems],
  );
  const filteredTrashItems = useMemo(() => {
    const query = trashQuery.trim().toLowerCase();
    return trashItems.filter((item) => {
      const matchesType = trashTypeFilter === "all" || item.type === trashTypeFilter;
      const matchesWeek = !onlyThisWeek || (trashDaysUntilPurge(item.deletedAt) ?? 0) <= PURGE_WEEK_DAYS;
      const matchesQuery = !query || `${trashTypeLabel(item.type)} ${item.title} ${item.subtitle} ${item.status} ${item.source}`.toLowerCase().includes(query);
      return matchesType && matchesWeek && matchesQuery;
    });
  }, [onlyThisWeek, trashItems, trashQuery, trashTypeFilter]);
  const groups = TYPE_ORDER
    .map((type) => ({ type, items: filteredTrashItems.filter((item) => item.type === type) }))
    .filter((group) => group.items.length);
  const clearFilters = () => {
    setTrashQuery("");
    setTrashTypeFilter("all");
    setOnlyThisWeek(false);
  };
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
      <PurgeRules />
      {trashItems.length ? (
        <>
          <div className="admin-toolbar">
            <label className="admin-search">
              <Search size={18} />
              <input aria-label="Buscar en papelera" className="field" onChange={(event) => setTrashQuery(event.target.value)} placeholder="Buscar en papelera..." value={trashQuery} />
            </label>
            <button
              aria-pressed={onlyThisWeek}
              className={`admin-trash-chip ${onlyThisWeek ? "is-on" : ""}`}
              disabled={!purgeThisWeek && !onlyThisWeek}
              onClick={() => setOnlyThisWeek((current) => !current)}
              type="button"
            >
              Se purgan esta semana <span>{purgeThisWeek}</span>
            </button>
            <Select
              ariaLabel="Tipo de elemento"
              onChange={(next) => setTrashTypeFilter(next as TrashItem["type"] | "all")}
              options={[
                { value: "all", label: "Todos los tipos" },
                { value: "order", label: "Pedidos" },
                { value: "product", label: "Productos" },
                { value: "category", label: "Categorías" },
                { value: "subcategory", label: "Subcategorías" },
                { value: "client", label: "Clientes" },
              ]}
              value={trashTypeFilter}
            />
          </div>
          <div className="admin-trash-list">
            {groups.length ? groups.map((group) => (
              <section aria-labelledby={`trash-group-${group.type}`} className="admin-trash-group" key={group.type}>
                <h2 id={`trash-group-${group.type}`}>
                  {trashTypeLabel(group.type)} <span>{group.items.length}</span>
                </h2>
                <ul>
                  {group.items.map((item) => <TrashRow item={item} key={`${item.type}-${item.id}`} onRestore={onRestore} />)}
                </ul>
              </section>
            )) : (
              <div className="admin-trash-empty">
                <strong>No hay elementos para esos filtros.</strong>
                <button className="ui-link-button" onClick={clearFilters} type="button">Limpiar filtros</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="admin-trash-empty">
          <span className="admin-trash-empty-icon"><Trash2 aria-hidden="true" size={22} /></span>
          <strong>La papelera está vacía</strong>
          <span>Lo que elimines del panel queda acá 30 días antes de borrarse solo.</span>
        </div>
      )}
    </section>
    </div>
    </>
  );
}
