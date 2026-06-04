"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  MoreVertical,
  FolderTree,
  Grid2x2,
  PackagePlus,
  Pencil,
  Search,
  Truck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { isSpecialCategorySlug } from "@/lib/special-categories";
import type { Branch, Category, OrderRecord, Product, WholesaleClient } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import {
  createCategoryAction,
  createProductAction,
  createSubcategoryAction,
  createWholesaleClientAction,
  createWholesaleOrderAction,
  deleteWholesaleClientAction,
  deleteCategoryAction,
  deleteProductAction,
  deleteSubcategoryAction,
  logoutAction,
  updateCategoryAction,
  updateOrderAction,
  updateOrderPaymentAction,
  updateProductAction,
  updateSubcategoryAction,
  updateWholesaleClientAction,
  updateStockAction,
} from "@/app/admin/actions";

type Subcategory = { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null; count: number };
type Section = "resumen" | "productos" | "categorias" | "punto-venta" | "ventas" | "ventas-web" | "clientes";
type Period = "day" | "week" | "month" | "year";
const WEB_PERIOD_STORAGE_KEY = "agrovet-web-period";
const UNCATEGORIZED_CATEGORY_VALUE = "__none";
const UNCATEGORIZED_SUBCATEGORY_SLUG = "sin-subcategoria";
const ADMIN_TIME_ZONE = "America/Argentina/Buenos_Aires";

function AdminModal({
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

function DeleteOrderModal({
  order,
  onClose,
}: {
  order: OrderRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const branchSummary = getOrderBranchBuckets(order)
    .map((bucket) => `${bucket.branchName}: ${bucket.quantity}`)
    .join(" | ") || order.branchName;
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle={`Vas a eliminar ${order.code} por ${formatPrice(order.totalCents)}. Esta acción no se puede deshacer.`}
      title="Confirmar eliminación"
      zIndex={240}
    >
      <form
        className="admin-confirm-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          const response = await fetch("/api/admin/orders/delete", {
            method: "POST",
            body: new FormData(event.currentTarget),
          });
          setSubmitting(false);
          if (!response.ok) return;
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
          Se eliminará el registro de facturación, se devolverá el stock reservado y no podrá recuperarse desde el panel.
        </p>
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

function SectionHeader({
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
        <p className="eyebrow">Panel de gestión</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action ? <div className="admin-section-action">{action}</div> : null}
    </header>
  );
}

type DashboardDetail =
  | { type: "revenue" }
  | { type: "out-stock" }
  | { type: "day-billing" }
  | { type: "pending-orders" }
  | { type: "day-history" }
  | { type: "channel-history" }
  | { type: "branch-stock" };

function toDate(value: string) {
  return new Date(`${value.replace(" ", "T")}Z`);
}

function formatAdminDateTime(value: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ADMIN_TIME_ZONE, ...options })
    .format(typeof value === "string" ? toDate(value) : value)
    .replace(/[\u00a0\u202f]/g, " ");
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCashOrder(order: OrderRecord) {
  return /^Caja\b/i.test(order.source);
}

function isWholesaleOrder(order: OrderRecord) {
  return /^Mayorista\b/i.test(order.source);
}

function isWebOrder(order: OrderRecord) {
  return !isCashOrder(order) && !isWholesaleOrder(order);
}

function dashboardBranchId(order: OrderRecord) {
  return getPrimaryOrderBranchId(order);
}

function belongsToDashboardBranch(order: OrderRecord, branchId: number) {
  return dashboardBranchId(order) === branchId;
}

function isPendingWebOrder(order: OrderRecord) {
  return isWebOrder(order) && !/entregado|completado|cancelado|cerrado|retirado/i.test(order.status);
}

function isCompletedWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /entregado|retirado/i.test(order.status);
}

function isCancelledWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /cancelad/i.test(order.status);
}

function isPickupWebOrder(order: OrderRecord) {
  return isWebOrder(order) && /retiro/i.test(order.fulfillment);
}

function isDeliveryWebOrder(order: OrderRecord) {
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

function orderHasBranch(order: OrderRecord, branchId: number) {
  return getOrderBranchBuckets(order).some((bucket) => bucket.branchId === branchId);
}

function getOrderBranchRevenueCents(order: OrderRecord, branchId: number) {
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

function startOfDay(value: Date) {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDayLabel(value: Date) {
  return formatAdminDateTime(value, { weekday: "short", day: "2-digit", month: "2-digit" });
}

function weekStart(value: Date) {
  const copy = startOfDay(value);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy;
}

function weekKey(value: Date) {
  return dateKey(weekStart(value));
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(value: Date) {
  const copy = startOfDay(value);
  copy.setDate(1);
  return copy;
}

function startOfYear(value: Date) {
  const copy = startOfDay(value);
  copy.setMonth(0, 1);
  return copy;
}

function periodBounds(period: Period, anchor: Date) {
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

function buildAdminHref(base: string, params: Record<string, string | null | undefined>) {
  const url = new URL(base, "http://127.0.0.1:3000");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function leafCategories(categories: Category[]) {
  return categories.filter((category) => !isSpecialCategorySlug(category.slug));
}

function getCategoryDeletionImpact(category: Category, categories: Category[], subcategories: Subcategory[], products: Product[]) {
  const childCategories = categories.filter((item) => item.parentCategoryId === category.id);
  const directSubcategories = subcategories.filter((subcategory) => subcategory.categoryId === category.id);
  const directSubcategorySlugs = new Set(directSubcategories.map((subcategory) => subcategory.slug));
  const affectedProducts = products.filter((product) => product.categorySlug === category.slug || directSubcategorySlugs.has(product.subcategorySlug));
  return {
    childCategoryCount: childCategories.length,
    subcategoryCount: directSubcategories.length,
    productCount: affectedProducts.length,
    hasContents: childCategories.length > 0 || directSubcategories.length > 0 || affectedProducts.length > 0,
  };
}

function getSubcategoryDeletionImpact(subcategory: Subcategory, products: Product[]) {
  const affectedProducts = products.filter((product) => product.subcategorySlug === subcategory.slug);
  return {
    productCount: affectedProducts.length,
  };
}

function CategoryDeleteModal({
  category,
  impact,
  returnTo,
  onClose,
  onContinue,
  stage,
}: {
  category: Category;
  impact: ReturnType<typeof getCategoryDeletionImpact>;
  returnTo: string;
  onClose: () => void;
  onContinue: () => void;
  stage: 1 | 2;
}) {
  const destructiveSummary = impact.hasContents
    ? `Se desasociarán ${impact.childCategoryCount} categorías internas, ${impact.subcategoryCount} subcategorías y ${impact.productCount} productos.`
    : "La categoría no tiene contenido asociado.";
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle={stage === 1 ? "Primero revisá qué se va a borrar." : "Confirmación final antes de eliminar."}
      title="Eliminar categoría"
      zIndex={240}
    >
      <div className="admin-confirm-visual">
        <div className="admin-confirm-icon">
          <Trash2 size={24} />
        </div>
        <div className="admin-confirm-copy">
          <strong>{category.name}</strong>
          <span>{category.parentCategoryName ? `${category.parentCategoryName} / ${category.name}` : category.name}</span>
        </div>
      </div>
      <p className="admin-confirm-text">
        {stage === 1
          ? `${destructiveSummary} Los elementos quedarán sin categoría o sin categoría padre para que después los reasignes.`
          : `Vas a eliminar definitivamente ${category.name}. Esta acción no se puede deshacer.`}
      </p>
      {stage === 1 ? (
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary danger" onClick={onContinue} type="button">Continuar</button>
        </div>
      ) : (
        <form
          action={deleteCategoryAction}
          className="admin-confirm-form"
          onSubmit={() => {
            onClose();
          }}
        >
          <input name="id" type="hidden" value={category.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="admin-modal-actions admin-confirm-actions">
            <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
            <button className="button button-primary danger" type="submit">Eliminar categoría</button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}

function SubcategoryDeleteModal({
  subcategory,
  impact,
  returnTo,
  onClose,
  onContinue,
  stage,
}: {
  subcategory: Subcategory;
  impact: ReturnType<typeof getSubcategoryDeletionImpact>;
  returnTo: string;
  onClose: () => void;
  onContinue: () => void;
  stage: 1 | 2;
}) {
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle={stage === 1 ? "Primero revisá qué productos van a quedar sin subcategoría." : "Confirmación final antes de eliminar."}
      title="Eliminar subcategoría"
      zIndex={240}
    >
      <div className="admin-confirm-visual">
        <div className="admin-confirm-icon">
          <Trash2 size={24} />
        </div>
        <div className="admin-confirm-copy">
          <strong>{subcategory.name}</strong>
          <span>{subcategory.categoryName ? `${subcategory.categoryName} / ${subcategory.name}` : subcategory.name}</span>
        </div>
      </div>
      <p className="admin-confirm-text">
        {stage === 1
          ? `Se dejarán ${impact.productCount} productos sin subcategoría definida para que después los reasignes.`
          : `Vas a eliminar definitivamente ${subcategory.name}. Esta acción no se puede deshacer.`}
      </p>
      {stage === 1 ? (
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary danger" onClick={onContinue} type="button">Continuar</button>
        </div>
      ) : (
        <form
          action={deleteSubcategoryAction}
          className="admin-confirm-form"
          onSubmit={() => {
            onClose();
          }}
        >
          <input name="slug" type="hidden" value={subcategory.slug} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="admin-modal-actions admin-confirm-actions">
            <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
            <button className="button button-primary danger" type="submit">Eliminar subcategoría</button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}

function ProductDeleteModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const variantCount = product.variants.length;
  const totalStock = product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
  return (
    <AdminModal
      className="admin-confirm-modal"
      dismissible={false}
      onClose={onClose}
      subtitle="Confirmación antes de eliminar."
      title="Eliminar producto"
      zIndex={240}
    >
      <div className="admin-confirm-visual">
        <div className="admin-confirm-icon">
          <Trash2 size={24} />
        </div>
        <div className="admin-confirm-copy">
          <strong>{product.brand} {product.name}</strong>
          <span>{product.category} / {product.subcategory}</span>
        </div>
      </div>
      <p className="admin-confirm-text">
        Vas a quitar este producto del catálogo. Si tiene ventas registradas, se archivará para conservar el historial de facturación; si no tiene ventas, se eliminará definitivamente.
      </p>
      <div className="admin-detail-summary compact">
        <strong>{variantCount} {variantCount === 1 ? "presentación" : "presentaciones"}</strong>
        <span>{totalStock} unidades de stock registradas</span>
      </div>
      <form
        action={deleteProductAction}
        className="admin-confirm-form"
        onSubmit={() => {
          onClose();
        }}
      >
        <input name="id" type="hidden" value={product.id} />
        <div className="admin-modal-actions admin-confirm-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary danger" type="submit">Eliminar producto</button>
        </div>
      </form>
    </AdminModal>
  );
}

function CategoryModal({
  category,
  categories,
  parentCategoryId,
  mode,
  returnTo,
  onClose,
}: {
  category?: Category;
  categories: Category[];
  parentCategoryId?: number;
  mode: "create" | "edit";
  returnTo: string;
  onClose: () => void;
}) {
  const title = mode === "create" ? "Nueva Categoría" : "Editar Categoría";
  const action = mode === "create" ? createCategoryAction : updateCategoryAction;
  const isFixedSpecialCategory = category ? isSpecialCategorySlug(category.slug) : false;
  const [showInMenu, setShowInMenu] = useState(category ? category.showInMenu : !parentCategoryId);
  const rootCategories = categories.filter((item) => item.showInMenu && !item.parentCategoryId && item.id !== category?.id && !isSpecialCategorySlug(item.slug));
  const defaultParentCategoryId = category?.parentCategoryId ?? parentCategoryId ?? rootCategories[0]?.id ?? "";
  return (
    <AdminModal
      onClose={onClose}
      subtitle={isFixedSpecialCategory ? "Esta categoría fija conserva su ubicación y destino especial." : mode === "create" ? "Creá una categoría principal o ubicá una categoría interna dentro del menú." : "Ajustá nombre, ubicación, slug y descripción."}
      title={title}
    >
      <form action={action} className="admin-modal-form">
        {mode === "edit" && category ? <input name="id" type="hidden" value={category.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        {isFixedSpecialCategory && category ? <input name="slug" type="hidden" value={category.slug} /> : null}
        {isFixedSpecialCategory && category?.showInMenu ? <input name="showInMenu" type="hidden" value="on" /> : null}
        <label className="admin-field">
          <span>Nombre de la categoría</span>
          <input className="field" defaultValue={category?.name ?? ""} name="name" placeholder="Ej: Alimentos" required />
        </label>
        {!isFixedSpecialCategory ? (
          <>
            <label className="admin-field">
              <span>Slug</span>
              <input className="field" defaultValue={category?.slug ?? ""} name="slug" placeholder="alimentos" required />
            </label>
            <label className="admin-field admin-span-2">
              <span>Descripción</span>
              <textarea
                className="field"
                defaultValue={category?.description ?? ""}
                name="description"
                placeholder="Describe qué incluye esta categoría"
              />
            </label>
            <label className="admin-check admin-span-2">
              <input checked={showInMenu} name="showInMenu" onChange={(event) => setShowInMenu(event.target.checked)} type="checkbox" />
              <span>Mostrar en el menú principal</span>
            </label>
          </>
        ) : null}
        {!isFixedSpecialCategory && !showInMenu ? (
          <label className="admin-field admin-span-2">
            <span>Dentro de la categoría del menú</span>
            <select className="field" defaultValue={defaultParentCategoryId} name="parentCategoryId" required>
              {rootCategories.length ? rootCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Primero creá una categoría principal</option>}
            </select>
          </label>
        ) : null}
        <div className="admin-modal-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{mode === "create" ? "Crear categoría" : "Guardar cambios"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

function SpecialCategoryVisibilityToggle({ category, returnTo }: { category: Category; returnTo: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={updateCategoryAction} className="admin-switch-form" ref={formRef}>
      <input name="id" type="hidden" value={category.id} />
      <input name="name" type="hidden" value={category.name} />
      <input name="slug" type="hidden" value={category.slug} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className="admin-switch">
        <input
          aria-label={`${category.showInMenu ? "Desactivar" : "Activar"} ${category.name}`}
          defaultChecked={category.showInMenu}
          name="showInMenu"
          onChange={() => formRef.current?.requestSubmit()}
          type="checkbox"
        />
        <span className="admin-switch-track">
          <span className="admin-switch-dot" />
        </span>
        <span className="admin-switch-text">{category.showInMenu ? "Activa" : "Inactiva"}</span>
      </label>
    </form>
  );
}

function SubcategoryModal({
  categories,
  returnTo,
  onClose,
  mode,
  categoryId,
  subcategory,
}: {
  categories: Category[];
  returnTo: string;
  onClose: () => void;
  mode: "create" | "edit";
  categoryId?: number;
  subcategory?: Subcategory;
}) {
  const action = mode === "create" ? createSubcategoryAction : updateSubcategoryAction;
  const title = mode === "create" ? "Nueva Subcategoría" : "Editar Subcategoría";
  const selectableCategories = leafCategories(categories);
  const selectedCategoryId = categoryId ?? subcategory?.categoryId ?? "";
  return (
    <AdminModal
      onClose={onClose}
      subtitle={mode === "create" ? "Asigna una subcategoría a una categoría madre." : "Mueve o renombra la subcategoría."}
      title={title}
    >
      <form action={action} className="admin-modal-form">
        {mode === "edit" && subcategory ? <input name="oldSlug" type="hidden" value={subcategory.slug} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="admin-field">
          <span>Categoría padre</span>
          <select className="field" defaultValue={selectedCategoryId} name="categoryId" required>
            <option disabled value="">Elegí una categoría</option>
            {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryName ? `${category.parentCategoryName} / ${category.name}` : category.name}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span>Nombre de la subcategoría</span>
          <input className="field" defaultValue={subcategory?.name ?? ""} name="name" placeholder="Ej: Perros, Gatos..." required />
        </label>
        <label className="admin-field admin-span-2">
          <span>Descripción</span>
          <textarea
            className="field"
            defaultValue={subcategory?.description ?? ""}
            name="description"
            placeholder="Describe esta subcategoría"
          />
        </label>
        <div className="admin-modal-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{mode === "create" ? "Crear subcategoría" : "Guardar cambios"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

function ProductModal({
  categories,
  returnTo,
  subcategories,
  onClose,
  mode,
  product,
}: {
  categories: Category[];
  returnTo: string;
  subcategories: Subcategory[];
  onClose: () => void;
  mode: "create" | "edit";
  product?: Product;
}) {
  const action = mode === "create" ? createProductAction : updateProductAction;
  const selectableCategories = leafCategories(categories);
  const initialCategoryId = product
    ? selectableCategories.find((category) => category.slug === product.categorySlug)?.id ?? null
    : selectableCategories[0]?.id ?? null;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(initialCategoryId);
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState(product?.subcategorySlug || UNCATEGORIZED_SUBCATEGORY_SLUG);
  const [brandValue, setBrandValue] = useState(product?.brand ?? "");
  const [saveBrandAsFrequent, setSaveBrandAsFrequent] = useState(false);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [frequentBrands] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem("agrovet-frequent-brands");
      if (!stored) return [];
      const parsed = JSON.parse(stored) as string[];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [variantRows, setVariantRows] = useState<Array<{
    id?: number;
    label: string;
    sku: string;
    barcode: string;
    price: string;
    stock1: string;
    stock2: string;
  }>>(
    product?.variants.length
      ? product.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        sku: variant.sku,
        barcode: variant.barcode,
        price: String(variant.priceCents / 100),
        stock1: String(variant.stocks.find((stock) => stock.branchId === 1)?.quantity ?? 0),
        stock2: String(variant.stocks.find((stock) => stock.branchId === 2)?.quantity ?? 0),
      }))
      : [{ label: "", sku: "", barcode: "", price: "", stock1: "0", stock2: "0" }],
  );
  const selectedCategory = selectedCategoryId ? categories.find((category) => category.id === selectedCategoryId) ?? null : null;
  const availableSubcategories = useMemo(
    () => (selectedCategory ? subcategories.filter((subcategory) => subcategory.categorySlug === selectedCategory.slug) : []),
    [selectedCategory, subcategories],
  );
  const brandKnown = frequentBrands.some((item) => item.toLowerCase() === brandValue.trim().toLowerCase());
  const resolvedSubcategorySlug = selectedCategory
    ? (availableSubcategories.some((subcategory) => subcategory.slug === selectedSubcategorySlug) ? selectedSubcategorySlug : availableSubcategories[0]?.slug ?? UNCATEGORIZED_SUBCATEGORY_SLUG)
    : UNCATEGORIZED_SUBCATEGORY_SLUG;
  const totalByRow = (row: { stock1: string; stock2: string }) => (Number(row.stock1) || 0) + (Number(row.stock2) || 0);
  return (
    <AdminModal
      onClose={onClose}
      subtitle={mode === "create" ? "Cargá un producto con todas sus presentaciones." : "Ajustá ficha, subcategoría, marca y variantes."}
      title={mode === "create" ? "Nuevo Producto" : "Editar Producto"}
    >
      <form action={action} className="admin-modal-form" onSubmitCapture={() => {
        if (saveBrandAsFrequent && !brandKnown) {
          const next = [...new Set([...frequentBrands, brandValue.trim()])].filter(Boolean).slice(0, 20);
          window.localStorage.setItem("agrovet-frequent-brands", JSON.stringify(next));
        }
      }}>
        {mode === "edit" && product ? <input name="id" type="hidden" value={product.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="admin-span-2 admin-detail-summary">
          <strong>Presentaciones cargadas</strong>
          <span>Revisá precio, código de barras y stock de cada variante antes de guardar.</span>
        </div>
        <div className="admin-span-2 admin-variant-preview">
          {variantRows.map((variant, index) => (
            <div className="admin-variant-preview-row" key={`${variant.id ?? "preview"}-${index}`}>
              <strong>{variant.label || `Presentación ${index + 1}`}</strong>
              <span>{variant.barcode || "Sin código"}</span>
              <small>{formatPrice((Number(variant.price) || 0) * 100)} | {totalByRow(variant)} u.</small>
            </div>
          ))}
        </div>
        <label className="admin-field admin-span-2">
          <span>Nombre del producto</span>
          <input className="field" defaultValue={product?.name ?? ""} name="name" placeholder="Nombre del producto" required />
        </label>
        <label className="admin-field">
          <span>Categoría</span>
          <select
            className="field"
            name="categoryId"
            required
            value={selectedCategoryId ?? UNCATEGORIZED_CATEGORY_VALUE}
            onChange={(event) => {
              const nextCategoryId = event.target.value ? Number(event.target.value) : null;
              if (event.target.value === UNCATEGORIZED_CATEGORY_VALUE) {
                setSelectedCategoryId(null);
                setSelectedSubcategorySlug(UNCATEGORIZED_SUBCATEGORY_SLUG);
                return;
              }
              setSelectedCategoryId(nextCategoryId);
              const nextCategory = selectableCategories.find((category) => category.id === nextCategoryId);
              const nextSubcategories = nextCategory ? subcategories.filter((subcategory) => subcategory.categorySlug === nextCategory.slug) : [];
              setSelectedSubcategorySlug(nextSubcategories[0]?.slug ?? UNCATEGORIZED_SUBCATEGORY_SLUG);
            }}
          >
            <option value={UNCATEGORIZED_CATEGORY_VALUE}>Sin categoría</option>
            {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryName ? `${category.parentCategoryName} / ${category.name}` : category.name}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span>Subcategoría</span>
          <select
            className="field"
            name="subcategorySlug"
            required
            value={resolvedSubcategorySlug}
            onChange={(event) => setSelectedSubcategorySlug(event.target.value)}
          >
            <option value={UNCATEGORIZED_SUBCATEGORY_SLUG}>Sin subcategoría</option>
            {availableSubcategories.map((subcategory) => <option key={subcategory.slug} value={subcategory.slug}>{subcategory.name}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span>Marca</span>
          <input
            className="field"
            list="frequent-brands"
            name="brand"
            placeholder="Marca"
            required
            value={brandValue}
            onChange={(event) => setBrandValue(event.target.value)}
          />
          <datalist id="frequent-brands">
            {frequentBrands.map((brand) => <option key={brand} value={brand} />)}
          </datalist>
          {!brandKnown && brandValue.trim() ? (
            <label className="admin-check">
              <input checked={saveBrandAsFrequent} onChange={(event) => setSaveBrandAsFrequent(event.target.checked)} type="checkbox" />
              <span>Guardar como marca frecuente</span>
            </label>
          ) : null}
        </label>
        <label className="admin-field">
          <span>Especie</span>
          <select className="field" defaultValue={product?.species ?? "perro"} name="species">
            <option value="perro">Perro</option>
            <option value="gato">Gato</option>
            <option value="perro-gato">Perro y gato</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Edad</span>
          <select className="field" defaultValue={product?.lifeStage ?? ""} name="lifeStage">
            <option value="">Sin definir</option>
            <option value="cachorro">Cachorro</option>
            <option value="junior">Junior</option>
            <option value="adulto">Adulto</option>
            <option value="senior">Senior</option>
            <option value="todas las edades">Todas las edades</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Tamaño</span>
          <select className="field" defaultValue={product?.size ?? ""} name="size">
            <option value="">Sin definir</option>
            <option value="mini">Mini</option>
            <option value="pequeño">Pequeño</option>
            <option value="mediano">Mediano</option>
            <option value="grande">Grande</option>
            <option value="gigante">Gigante</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Necesidad</span>
          <input className="field" defaultValue={product?.need ?? ""} name="need" placeholder="Piel sensible" />
        </label>
        <label className="admin-field admin-span-2">
          <span>Descripción</span>
          <textarea className="field" defaultValue={product?.description ?? ""} name="description" placeholder="Descripción del producto" required />
        </label>
        <input name="color" type="hidden" value={product?.color ?? "#c8161f"} />
        <label className="admin-field admin-span-2">
          <span>Foto del producto</span>
          <input
            accept="image/*"
            className="field"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setImageUrl(product?.imageUrl ?? "");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setImageUrl(String(reader.result ?? ""));
              reader.readAsDataURL(file);
            }}
            type="file"
          />
          <input name="imageUrl" type="hidden" value={imageUrl} />
          <div className="admin-image-preview">
            {imageUrl ? <img alt="Vista previa del producto" src={imageUrl} /> : <div className="admin-image-preview-empty">Subí una imagen para verla aquí</div>}
            {imageUrl ? (
              <button className="button button-light" onClick={() => setImageUrl("")} type="button">Quitar imagen</button>
            ) : null}
          </div>
        </label>
        <label className="admin-check">
          <input defaultChecked={Boolean(product?.featured)} name="featured" type="checkbox" />
          <span>Destacado</span>
        </label>
        <label className="admin-check">
          <input defaultChecked={Boolean(product?.requiresAdvice)} name="requiresAdvice" type="checkbox" />
          <span>Requiere asesoramiento</span>
        </label>
        <div className="admin-span-2 admin-detail-summary">
          <strong>Presentaciones</strong>
          <span>Agregá una o varias bolsas, potes o tamaños del mismo producto.</span>
        </div>
        {variantRows.map((variant, index) => (
          <div className="admin-variant-card" key={`${variant.id ?? "new"}-${index}`}>
            <div className="admin-variant-head admin-span-2">
              <strong>Presentación {index + 1}</strong>
              {variantRows.length > 1 ? (
                <button
                  className="icon-button danger"
                  onClick={() => setVariantRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                  type="button"
                  aria-label={`Eliminar presentación ${index + 1}`}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <input name="variantId" type="hidden" value={variant.id ?? ""} />
            <label className="admin-field">
              <span>Presentación</span>
              <input
                className="field"
                name="variantLabel"
                placeholder="1 kg"
                required
                value={variant.label}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, label: value } : row)));
                }}
              />
            </label>
            <label className="admin-field">
              <span>SKU</span>
              <input
                className="field"
                name="variantSku"
                placeholder="SKU"
                required
                value={variant.sku}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, sku: value } : row)));
                }}
              />
            </label>
            <label className="admin-field">
              <span>Código de barras</span>
              <input
                className="field"
                name="variantBarcode"
                placeholder="Escaneá aquí o escribí el número"
                value={variant.barcode}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, barcode: value } : row)));
                }}
              />
            </label>
            <label className="admin-field">
              <span>Precio</span>
              <input
                className="field"
                min="1"
                name="variantPrice"
                step="0.01"
                type="number"
                required
                value={variant.price}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, price: value } : row)));
                }}
              />
            </label>
            <label className="admin-field">
              <span>Stock Independencia</span>
              <input
                className="field"
                min="0"
                name="variantStock1"
                type="number"
                required
                value={variant.stock1}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, stock1: value } : row)));
                }}
              />
            </label>
            <label className="admin-field">
              <span>Stock Belgrano</span>
              <input
                className="field"
                min="0"
                name="variantStock2"
                type="number"
                required
                value={variant.stock2}
                onChange={(event) => {
                  const value = event.target.value;
                  setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, stock2: value } : row)));
                }}
              />
            </label>
            <div className="admin-span-2 admin-detail-summary compact">
              <strong>{totalByRow(variant)} unidades</strong>
              <span>{variant.stock1 || "0"} en Independencia, {variant.stock2 || "0"} en Belgrano</span>
            </div>
          </div>
        ))}
        <div className="admin-span-2">
          <button className="button button-light" type="button" onClick={() => setVariantRows((rows) => ([...rows, { label: "", sku: "", barcode: "", price: "", stock1: "0", stock2: "0" }]))}>
            <PackagePlus size={16} /> Agregar presentación
          </button>
        </div>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{mode === "create" ? "Crear producto" : "Guardar cambios"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

function OrderModal({
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

function PendingOrderCard({
  onSelectOrder,
  order,
  onEditDistribution,
  onCompleteOrder,
  returnTo,
  dense = false,
  branchId,
  showStatusActions = true,
}: {
  onSelectOrder: (order: OrderRecord) => void;
  order: OrderRecord;
  onEditDistribution?: (order: OrderRecord) => void;
  onCompleteOrder?: (order: OrderRecord, status: "Entregado" | "Retirado") => void;
  returnTo: string;
  dense?: boolean;
  branchId?: number;
  showStatusActions?: boolean;
}) {
  const itemLabel = getOrderDisplayItems(order, branchId).slice(0, 3).join(" · ");
  const compactMode = dense || branchId !== undefined;
  return (
    <article className={`admin-pending-card${compactMode ? " dense" : ""}`}>
      <header className="admin-pending-card-head">
        <div>
          <strong>{order.code}</strong>
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
          {showStatusActions ? (
            order.fulfillment.toLowerCase().includes("envio") ? (
              <>
                {onCompleteOrder ? (
                  <button className="button button-light" onClick={() => onCompleteOrder(order, "Entregado")} type="button">Entregado</button>
                ) : (
                  <OrderStatusButton label="Entregado" order={order} returnTo={returnTo} status="Entregado" />
                )}
                <OrderStatusButton label="Cancelar" order={order} returnTo={returnTo} status="Cancelado" />
              </>
            ) : (
              <>
                {onCompleteOrder ? (
                  <button className="button button-light" onClick={() => onCompleteOrder(order, "Retirado")} type="button">Retirado</button>
                ) : (
                  <OrderStatusButton label="Retirado" order={order} returnTo={returnTo} status="Retirado" />
                )}
                <OrderStatusButton label="Cancelar" order={order} returnTo={returnTo} status="Cancelado" />
              </>
            )
          ) : null}
          {onEditDistribution ? (
            <button className="button button-light subtle" onClick={() => onEditDistribution(order)} type="button">
              Cambiar sucursal
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function WebOrderStatusModal({
  onClose,
  order,
  returnTo,
  status,
}: {
  onClose: () => void;
  order: OrderRecord;
  returnTo: string;
  status: "Entregado" | "Retirado";
}) {
  const paymentMatch = /^(Tarjeta)(?: \((\d+) cuotas\))?/i.exec(order.paymentMethod);
  const [paymentMethod, setPaymentMethod] = useState(paymentMatch?.[1] ?? (order.paymentMethod || "Efectivo"));
  const [installments, setInstallments] = useState(paymentMatch?.[2] ?? "1");
  const [submitting, setSubmitting] = useState(false);
  const paymentMethodValue = paymentMethod === "Tarjeta" ? `Tarjeta (${installments} cuotas)` : paymentMethod;
  return (
    <AdminModal
      dismissible={!submitting}
      onClose={onClose}
      subtitle={`${order.code} | ${order.branchName} | ${status.toLowerCase() === "entregado" ? "cierre de envío" : "cierre de retiro"}`}
      title={`Marcar como ${status.toLowerCase()}`}
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
        <input name="paymentMethod" type="hidden" value={paymentMethodValue} />
        <input name="returnTo" type="hidden" value={returnTo} />
        {order.items.map((item) => (
          <div key={`${order.id}-${item.variantId}`}>
            <input name="itemVariantId" type="hidden" value={item.variantId} />
            <input name="itemQuantity" type="hidden" value={item.quantity} />
          </div>
        ))}
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
        <div className="admin-detail-summary compact admin-span-2">
          <strong>{order.code}</strong>
          <span>{order.customerName} | {formatPrice(order.totalCents)} | {paymentMethodValue}</span>
        </div>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" disabled={submitting} onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" disabled={submitting} type="submit">Confirmar cierre</button>
        </div>
      </form>
    </AdminModal>
  );
}

function WebOrderDistributionModal({
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

function StockEditModal({
  branch,
  branches,
  onClose,
  product,
  returnTo,
}: {
  branch: Branch;
  branches: Branch[];
  onClose: () => void;
  product: Product;
  returnTo: string;
}) {
  const mainVariant = product.variants[0];
  if (!mainVariant) return null;
  const currentStock = mainVariant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0;
  const otherStocks = branches.filter((item) => item.id !== branch.id);
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
          <small className="description">Se suma al stock actual de {branch.name}. Usa teclado o flechas.</small>
        </label>
        <div className="admin-modal-actions admin-span-2 admin-modal-actions-sticky">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">Guardar stock</button>
        </div>
        <div className="admin-mini-list admin-span-2">
          {otherStocks.map((item) => {
            const otherStock = mainVariant.stocks.find((stock) => stock.branchId === item.id)?.quantity ?? 0;
            return (
              <div className="admin-mini-list-row" key={item.id}>
                <span>{item.name}</span>
                <small>{otherStock} u.</small>
              </div>
            );
          })}
        </div>
      </form>
    </AdminModal>
  );
}

function BranchPickerModal({
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

function DashboardDetailModal({
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
  onCompleteOrder: (order: OrderRecord, status: "Entregado" | "Retirado") => void;
  onEditStock: (product: Product) => void;
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
  const outOfStock = useMemo(() => products.filter((product) => product.variants.every((variant) => (variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0) === 0)), [products, selectedBranch.id]);
  const lowStock = useMemo(() => products.filter((product) => product.variants.some((variant) => {
    const quantity = variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0;
    return quantity > 0 && quantity <= 3;
  })), [products, selectedBranch.id]);
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
      const key = weekKey(toDate(order.createdAt));
      const current = groups.get(key) ?? {};
      if (order.branchId === 1) current["Sucursal Independencia"] = (current["Sucursal Independencia"] ?? 0) + order.totalCents;
      else if (order.branchId === 2) current["Sucursal Belgrano"] = (current["Sucursal Belgrano"] ?? 0) + order.totalCents;
      groups.set(key, current);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);
  const branchInventory = useMemo(() => branches.map((branch) => {
    const zero = products.filter((product) => product.variants.every((variant) => (variant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0) === 0));
    return { branch, zero };
  }), [branches, products]);
  const stockAlertList = alertView === "out" ? outOfStock : lowStock;
  const stockAlertTitle = alertView === "out" ? "Productos sin stock" : "Productos con stock bajo";

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
              <strong>{alertView === "out" ? `${outOfStock.length} productos sin stock` : `${lowStock.length} productos con stock bajo`}</strong>
              <span>La sucursal activa es {selectedBranch.name}</span>
            </div>
            <div className="admin-view-tabs">
              <button className={`choice-card ${alertView === "out" ? "active" : ""}`} onClick={() => setAlertView("out")} type="button">Sin stock</button>
              <button className={`choice-card ${alertView === "low" ? "active" : ""}`} onClick={() => setAlertView("low")} type="button">Stock bajo</button>
            </div>
            <div className="admin-product-list">
              {stockAlertList.map((product) => (
                <div className="admin-table-row compact" key={product.id}>
                  <div>
                    <strong>{product.brand} {product.name}</strong>
                    <small>{product.category} | {product.subcategory} | {product.variants[0]?.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0} unidades en {selectedBranch.name}</small>
                  </div>
                  <div className="admin-row-actions">
                    <span className={`admin-stock-pill ${alertView === "out" ? "danger" : ""}`}>{alertView === "out" ? "Sin stock" : "Stock bajo"}</span>
                    <button className="button button-light" onClick={() => onEditStock(product)} type="button">Agregar stock</button>
                  </div>
                </div>
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

function StatCard({
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

function DashboardCharts({
  orders,
  products,
  branches,
  branchRevenue,
  basePath,
  selectedBranchId,
}: {
  orders: OrderRecord[];
  products: Product[];
  branches: Branch[];
  branchRevenue: { branch: string; value: number }[];
  basePath: string;
  selectedBranchId: number;
  }) {
  const detailLink = (type: DashboardDetail["type"]) => buildAdminHref(basePath, {
    branch: String(selectedBranchId),
    detail: type,
    order: null,
    section: "resumen",
  });
  const [channelRange, setChannelRange] = useState<"day" | "week" | "month">("day");
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const lastSevenDays = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = dateKey(date);
      const totalCents = orders
        .filter((order) => dateKey(toDate(order.createdAt)) === key)
        .reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranchId), 0);
      return { key, label: formatDayLabel(date), totalCents };
    });
    const maxValue = Math.max(...days.map((day) => day.totalCents), 1);
    return days.map((day) => ({ ...day, percent: Math.max(8, Math.round((day.totalCents / maxValue) * 100)) }));
  }, [orders, selectedBranchId]);
  const selectedBranchName = branches.find((branch) => branch.id === selectedBranchId)?.name ?? "Sucursal activa";
  const channelPeriodLabel = channelRange === "day" ? "del día" : channelRange === "week" ? "de la semana" : "del mes";
  const channelStats = useMemo(() => {
    const totals = {
      "Sucursal Independencia": 0,
      "Sucursal Belgrano": 0,
    };
    const todayKey = dateKey(new Date());
    const currentWeekKey = weekKey(new Date());
    const currentMonthKey = monthKey(new Date());
    for (const order of orders) {
      const orderDate = toDate(order.createdAt);
      const orderDayKey = dateKey(orderDate);
      if (channelRange === "day" && orderDayKey !== todayKey) continue;
      if (channelRange === "week" && weekKey(orderDate) !== currentWeekKey) continue;
      if (channelRange === "month" && monthKey(orderDate) !== currentMonthKey) continue;
      if (order.branchId === 1) totals["Sucursal Independencia"] += order.totalCents;
      else if (order.branchId === 2) totals["Sucursal Belgrano"] += order.totalCents;
    }
    const palette = ["#c8161f", "#e12a31", "#8f0d11", "#d64531"];
    const entries = Object.entries(totals);
    const total = entries.reduce((sum, [, current]) => sum + current, 0) || 1;
    return entries.map(([name, value], index) => ({ name, value, percent: Math.round((value / total) * 100), color: palette[index % palette.length] }));
  }, [channelRange, orders]);
  const outStockByBranch = branches.map((branch) => ({
    branch,
    count: products.filter((product) => product.variants.every((variant) => (variant.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0) === 0)).length,
  }));
  const channelTotal = channelStats.reduce((sum, item) => sum + item.value, 0);
  const channelGradient = channelStats.length
    ? (channelTotal > 0
      ? `conic-gradient(${channelStats.map((item, index) => {
        const start = channelStats.slice(0, index).reduce((sum, prev) => sum + prev.percent, 0);
        const end = channelStats.slice(0, index + 1).reduce((sum, prev) => sum + prev.percent, 0);
        return `${item.color} ${start}% ${end}%`;
      }).join(", ")})`
      : "conic-gradient(#f2e1e0 0% 100%)")
    : "conic-gradient(#f2e1e0 0% 100%)";
  return (
    <div className="admin-chart-grid">
      <section className="card admin-panel">
        <Link className="admin-title-button" href={detailLink("day-history")}>
          <div>
            <h2>Ventas por día</h2>
            <p className="description">{selectedBranchName}</p>
          </div>
          <ChevronRight size={18} />
        </Link>
        <div className="admin-bars">
          {lastSevenDays.map((day) => {
            return (
              <div className="admin-bar-row" key={day.key}>
                <span>{day.label}</span>
                <div className="admin-bar-track" title={`${formatPrice(day.totalCents)}`} aria-label={`${day.label} ${formatPrice(day.totalCents)}`}>
                  <div className="admin-bar-fill" style={{ width: `${day.percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card admin-panel">
        <div className="admin-donut-card-head">
          <div>
            <h2>Ingresos por canal</h2>
            <p className="description">Total {channelPeriodLabel}</p>
          </div>
          <div className="admin-donut-actions">
            <strong>{formatPrice(channelTotal)}</strong>
            <div className="admin-menu-wrap">
              <button aria-label="Cambiar periodo" className="icon-button" onClick={() => setChannelMenuOpen((value) => !value)} type="button">
                <MoreVertical size={18} />
              </button>
              {channelMenuOpen ? (
                <div className="admin-menu-popover">
                  <button className={`admin-menu-item ${channelRange === "day" ? "active" : ""}`} onClick={() => { setChannelRange("day"); setChannelMenuOpen(false); }} type="button">Por día</button>
                  <button className={`admin-menu-item ${channelRange === "week" ? "active" : ""}`} onClick={() => { setChannelRange("week"); setChannelMenuOpen(false); }} type="button">Por semana</button>
                  <button className={`admin-menu-item ${channelRange === "month" ? "active" : ""}`} onClick={() => { setChannelRange("month"); setChannelMenuOpen(false); }} type="button">Por mes</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="admin-donut-card">
          <div className="admin-donut-chart" style={{ background: channelGradient }} title={channelTotal ? formatPrice(channelTotal) : "Sin ventas"} />
          <div className="admin-donut-list">
            {channelStats.length ? channelStats.map((item) => (
              <div className="admin-donut-row" key={item.name} title={formatPrice(item.value)}>
                <strong>{item.name}</strong>
                <span>{item.percent}%</span>
                <small>{formatPrice(item.value)}</small>
              </div>
            )) : <p className="description">Todavia no hay ventas registradas.</p>}
          </div>
        </div>
      </section>
      <section className="card admin-panel admin-span-2">
        <Link className="admin-title-button" href={detailLink("branch-stock")}>
          <h2>Stock por sucursal</h2>
          <ChevronRight size={18} />
        </Link>
        <div className="admin-mini-list admin-mini-list-columns">
          {outStockByBranch.map((item) => (
            <span key={item.branch.id}>{item.branch.name}: {item.count} sin stock</span>
          ))}
        </div>
      </section>
      <section className="card admin-panel admin-span-2">
        <h2>Ingresos por sucursal</h2>
        <div className="admin-donut-list">
          {branchRevenue.map((item) => (
            <div className="admin-donut-row" key={item.branch}>
              <strong>{item.branch}</strong>
              <span>{formatPrice(item.value)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type WholesaleLine = {
  key: string;
  variantId: number;
  productName: string;
  brand: string;
  label: string;
  sku: string;
  barcode: string;
  priceCents: number;
  quantity: number;
  allocations: { branchId: number; quantity: number }[];
  stocks: Product["variants"][number]["stocks"];
};

function distributeWholesaleQuantity(quantity: number, stocks: WholesaleLine["stocks"], preferredBranchId: number) {
  const totalStock = stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const targetQuantity = Math.min(Math.max(1, quantity), Math.max(1, totalStock));
  const orderedStocks = [
    ...stocks.filter((stock) => stock.branchId === preferredBranchId),
    ...stocks.filter((stock) => stock.branchId !== preferredBranchId).sort((a, b) => b.quantity - a.quantity),
  ];
  let remaining = targetQuantity;
  const allocations: { branchId: number; quantity: number }[] = [];
  for (const stock of orderedStocks) {
    if (remaining <= 0) break;
    if (stock.quantity <= 0) continue;
    const allocated = Math.min(remaining, stock.quantity);
    allocations.push({ branchId: stock.branchId, quantity: allocated });
    remaining -= allocated;
  }
  return allocations;
}

function rebalanceWholesaleAllocation(line: WholesaleLine, branchId: number, requestedQuantity: number, branches: Branch[]) {
  const totalStock = line.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const totalQuantity = Math.min(line.quantity, totalStock);
  const branchStock = line.stocks.find((stock) => stock.branchId === branchId)?.quantity ?? 0;
  const selectedQuantity = Math.min(Math.max(0, requestedQuantity), Math.min(branchStock, totalQuantity));
  let remaining = totalQuantity - selectedQuantity;
  const nextAllocations = [{ branchId, quantity: selectedQuantity }];
  const otherBranches = branches
    .filter((branch) => branch.id !== branchId)
    .map((branch) => ({
      branchId: branch.id,
      current: line.allocations.find((allocation) => allocation.branchId === branch.id)?.quantity ?? 0,
      stock: line.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0,
    }))
    .sort((a, b) => b.current - a.current || b.stock - a.stock);
  for (const branch of otherBranches) {
    if (remaining <= 0) break;
    const quantity = Math.min(branch.stock, remaining);
    nextAllocations.push({ branchId: branch.branchId, quantity });
    remaining -= quantity;
  }
  return nextAllocations.filter((allocation) => allocation.quantity > 0).sort((a, b) => a.branchId - b.branchId);
}

function formatWholesaleClientMeta(client: WholesaleClient) {
  return [client.contactName, client.phone, client.email, client.address, client.taxId].filter(Boolean).join(" | ") || "Sin datos adicionales";
}

function WholesaleClientModal({ client, onClose, returnTo }: { client?: WholesaleClient; onClose: () => void; returnTo: string }) {
  return (
    <AdminModal onClose={onClose} subtitle="Datos comerciales para pedidos por mayor" title={client ? "Editar cliente" : "Nuevo cliente"}>
      <form action={client ? updateWholesaleClientAction : createWholesaleClientAction} className="admin-modal-form">
        {client ? <input name="id" type="hidden" value={client.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="admin-field">
          <span>Pet shop / Razón social</span>
          <input autoFocus className="field" defaultValue={client?.businessName ?? ""} name="businessName" required />
        </label>
        <label className="admin-field">
          <span>Contacto</span>
          <input className="field" defaultValue={client?.contactName ?? ""} name="contactName" />
        </label>
        <label className="admin-field">
          <span>Teléfono</span>
          <input className="field" defaultValue={client?.phone ?? ""} name="phone" />
        </label>
        <label className="admin-field">
          <span>Email</span>
          <input className="field" defaultValue={client?.email ?? ""} name="email" type="email" />
        </label>
        <label className="admin-field">
          <span>Dirección</span>
          <input className="field" defaultValue={client?.address ?? ""} name="address" />
        </label>
        <label className="admin-field">
          <span>CUIT / DNI</span>
          <input className="field" defaultValue={client?.taxId ?? ""} name="taxId" />
        </label>
        <label className="admin-field admin-span-2">
          <span>Notas</span>
          <textarea className="field" defaultValue={client?.notes ?? ""} name="notes" rows={3} />
        </label>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{client ? "Guardar cliente" : "Crear cliente"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

function WholesaleClientsPanel({
  basePath,
  branches,
  clients,
  onCreateClient,
  onDeleteOrder,
  onEditClient,
  orders,
  products,
  selectedBranch,
}: {
  basePath: string;
  branches: Branch[];
  clients: WholesaleClient[];
  onCreateClient: () => void;
  onDeleteOrder: (order: OrderRecord) => void;
  onEditClient: (client: WholesaleClient) => void;
  orders: OrderRecord[];
  products: Product[];
  selectedBranch: Branch;
}) {
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<WholesaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Cuenta corriente");
  const [installments, setInstallments] = useState("1");
  const [paidAmount, setPaidAmount] = useState("");
  const [view, setView] = useState<"order" | "clients">("order");
  const variants = useMemo(() => products.flatMap((product) => product.variants.map((variant) => ({
    variant,
    product,
    search: `${product.brand} ${product.name} ${variant.label} ${variant.sku} ${variant.barcode}`.toLowerCase(),
  }))), [products]);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return variants.filter((entry) => entry.search.includes(value)).slice(0, 10);
  }, [query, variants]);
  const selectedClient = clients.find((client) => String(client.id) === clientId);
  const filteredClients = useMemo(() => {
    const value = clientQuery.trim().toLowerCase();
    if (!value) return clients;
    return clients.filter((client) => `${client.businessName} ${client.contactName} ${client.phone} ${client.email} ${client.address} ${client.taxId} ${client.notes}`.toLowerCase().includes(value));
  }, [clientQuery, clients]);
  const wholesaleOrders = orders.filter((order) => /^Mayorista\b/i.test(order.source));
  const pendingAccountOrders = wholesaleOrders.filter((order) => order.paymentMethod === "Cuenta corriente" && order.paidCents < order.totalCents);
  const paymentMethodValue = paymentMethod === "Tarjeta" ? `Tarjeta (${installments} cuotas)` : paymentMethod;
  const parsedPaidAmount = Math.max(0, Number(paidAmount) || 0);
  const addVariant = (entry: (typeof variants)[number]) => {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === entry.variant.id);
      const totalStock = entry.variant.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
      if (totalStock <= 0) return current;
      if (existing) {
        const existingTotalStock = existing.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
        const quantity = Math.min(existing.quantity + 1, existingTotalStock);
        return current.map((line) => line.key === existing.key ? { ...line, quantity, allocations: distributeWholesaleQuantity(quantity, line.stocks, selectedBranch.id) } : line);
      }
      return [...current, {
        key: `${entry.variant.id}-${Date.now()}`,
        variantId: entry.variant.id,
        productName: entry.product.name,
        brand: entry.product.brand,
        label: entry.variant.label,
        sku: entry.variant.sku,
        barcode: entry.variant.barcode,
        priceCents: entry.variant.priceCents,
        quantity: 1,
        allocations: distributeWholesaleQuantity(1, entry.variant.stocks, selectedBranch.id),
        stocks: entry.variant.stocks,
      }];
    });
    setQuery("");
  };
  const submitSearch = () => {
    const value = query.trim().toLowerCase();
    if (!value) return;
    const exact = variants.find((entry) => entry.variant.barcode.toLowerCase() === value || entry.variant.sku.toLowerCase() === value);
    if (exact) addVariant(exact);
  };
  const totalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  if (view === "clients") {
    return (
      <div className="admin-detail-stack">
        <SectionHeader
          action={(
            <div className="admin-row-actions">
              <button className="button button-light" onClick={() => setView("order")} type="button">Volver a pedidos</button>
              <button className="button button-primary" onClick={onCreateClient} type="button"><PackagePlus size={18} /> Nuevo cliente</button>
            </div>
          )}
          subtitle="Alta, edición y baja de clientes mayoristas"
          title="Clientes guardados"
        />
        <section className="card admin-panel">
          <div className="admin-product-list">
            {clients.length ? clients.map((client) => (
              <div className={`admin-table-row compact ${String(client.id) === clientId ? "active" : ""}`} key={client.id}>
                <button className="admin-title-button" onClick={() => { setClientId(String(client.id)); setClientQuery(""); setView("order"); }} type="button">
                  <div>
                    <strong>{client.businessName}</strong>
                    <small>{formatWholesaleClientMeta(client)}</small>
                  </div>
                </button>
                <div className="admin-row-actions">
                  <button className="icon-button" onClick={() => onEditClient(client)} type="button" aria-label="Editar cliente"><Pencil size={16} /></button>
                  <form action={deleteWholesaleClientAction}>
                    <input name="id" type="hidden" value={client.id} />
                    <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
                    <button className="icon-button danger" type="submit" aria-label="Eliminar cliente"><Trash2 size={16} /></button>
                  </form>
                </div>
              </div>
            )) : <p className="description">Todavía no hay clientes mayoristas cargados.</p>}
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="admin-detail-stack">
      <SectionHeader
        action={(
          <div className="admin-row-actions">
            <button className="button button-light" onClick={() => setView("clients")} type="button"><Users size={18} /> Clientes guardados</button>
            <button className="button button-primary" onClick={onCreateClient} type="button"><PackagePlus size={18} /> Nuevo cliente</button>
          </div>
        )}
        subtitle="Clientes mayoristas, pedidos grandes y descuento de stock por sucursal"
        title="Clientes"
      />
      <div className="admin-two-columns">
        <section className="card admin-panel">
          <h2>Crear pedido mayorista</h2>
          <form action={createWholesaleOrderAction} className="admin-detail-stack">
            <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
            <input name="clientId" type="hidden" value={clientId} />
            <div className="admin-point-field">
              <label>Cliente</label>
              <div className="admin-scan-row">
                <input
                  className="field"
                  onChange={(event) => setClientQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="Buscar por nombre, teléfono, mail, dirección o CUIT..."
                  value={clientQuery}
                />
                <button className="button button-light" onClick={() => setView("clients")} type="button">
                  <Users size={18} />
                </button>
              </div>
              {clientQuery.trim() ? (
                <div className="admin-product-list">
                  {filteredClients.length ? filteredClients.slice(0, 6).map((client) => (
                    <button
                      className="admin-table-row compact"
                      key={client.id}
                      onClick={() => {
                        setClientId(String(client.id));
                        setClientQuery("");
                      }}
                      type="button"
                    >
                      <div>
                        <strong>{client.businessName}</strong>
                        <small>{formatWholesaleClientMeta(client)}</small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  )) : <p className="description">No hay clientes con esos datos.</p>}
                </div>
              ) : null}
              {selectedClient ? (
                <div className="admin-detail-summary compact">
                  <strong>{selectedClient.businessName}</strong>
                  <span>{formatWholesaleClientMeta(selectedClient)}</span>
                  <button className="button button-light" onClick={() => setClientId("")} type="button">Quitar cliente</button>
                </div>
              ) : null}
            </div>
            <input name="branchId" type="hidden" value={selectedBranch.id} />
            <div className="admin-point-field">
              <label>Buscar por producto, SKU o código de barras</label>
              <div className="admin-scan-row">
                <input
                  className="field"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch();
                    }
                  }}
                  placeholder="Escaneá o escribí para buscar..."
                  value={query}
                />
                <button className="button button-primary" onClick={submitSearch} type="button"><Search size={18} /></button>
              </div>
              {results.length ? (
                <div className="admin-product-list">
                  {results.map((entry) => (
                    <button className="admin-table-row compact" key={entry.variant.id} onClick={() => addVariant(entry)} type="button">
                      <div>
                        <strong>{entry.product.brand} {entry.product.name}</strong>
                        <small>{entry.variant.label} | SKU {entry.variant.sku} | Código {entry.variant.barcode}</small>
                      </div>
                      <span className="admin-stock-pill">{formatPrice(entry.variant.priceCents)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="admin-product-list">
              {lines.length ? lines.map((line) => {
                const allocatedTotal = line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
                const totalStock = line.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
                return (
                  <div className="admin-table-row compact" key={line.key}>
                    <div>
                      <strong>{line.brand} {line.productName}</strong>
                      <small>{line.label} | {line.sku} | {line.barcode} | stock total {totalStock}</small>
                    </div>
                    <label className="admin-point-field">
                      <span>Cant.</span>
                      <input
                        className="field"
                        max={totalStock}
                        min="1"
                        onChange={(event) => {
                          const quantity = Math.min(totalStock, Math.max(1, Number(event.target.value) || 1));
                          setLines((current) => current.map((item) => item.key === line.key ? {
                            ...item,
                            quantity,
                            allocations: distributeWholesaleQuantity(quantity, item.stocks, selectedBranch.id),
                          } : item));
                        }}
                        type="number"
                        value={line.quantity}
                      />
                    </label>
                    <div className="admin-detail-stack">
                      {branches.map((branch) => {
                        const stock = line.stocks.find((entry) => entry.branchId === branch.id)?.quantity ?? 0;
                        const allocation = line.allocations.find((entry) => entry.branchId === branch.id);
                        const quantity = allocation?.quantity ?? 0;
                        return (
                          <label className="admin-point-field" key={branch.id}>
                            <span>{branch.name} ({stock})</span>
                            <input
                              className="field"
                              max={stock}
                              min="0"
                              onChange={(event) => {
                                const nextQuantity = Math.max(0, Number(event.target.value) || 0);
                                setLines((current) => current.map((item) => {
                                  if (item.key !== line.key) return item;
                                  return { ...item, allocations: rebalanceWholesaleAllocation(item, branch.id, nextQuantity, branches) };
                                }));
                              }}
                              type="number"
                              value={quantity}
                            />
                          </label>
                        );
                      })}
                      <small className={allocatedTotal === line.quantity ? "description" : "notice error"}>
                        {allocatedTotal === line.quantity ? "Distribución lista" : `Distribución incompleta: ${allocatedTotal}/${line.quantity}`}
                      </small>
                    </div>
                    <button className="icon-button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} type="button" aria-label="Quitar producto"><Trash2 size={16} /></button>
                    {line.allocations.map((allocation) => (
                      <div key={`${line.key}-${allocation.branchId}`}>
                        <input name="itemVariantId" type="hidden" value={line.variantId} />
                        <input name="itemQuantity" type="hidden" value={allocation.quantity} />
                        <input name="itemBranchId" type="hidden" value={allocation.branchId} />
                      </div>
                    ))}
                  </div>
                );
              }) : <p className="description">Agregá productos con el buscador o escaneando códigos de barras.</p>}
            </div>
            <label className="admin-point-field">
              <span>Medio de pago</span>
              <input name="paymentMethod" type="hidden" value={paymentMethodValue} />
              <select
                className="field"
                onChange={(event) => {
                  setPaymentMethod(event.target.value);
                  if (event.target.value !== "Cuenta corriente") setPaidAmount("");
                }}
                value={paymentMethod}
              >
                <option>Cuenta corriente</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Tarjeta</option>
              </select>
            </label>
            {paymentMethod === "Tarjeta" ? (
              <label className="admin-point-field">
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
            {paymentMethod === "Cuenta corriente" ? (
              <label className="admin-point-field">
                <span>Entrega inicial opcional</span>
                <input
                  className="field"
                  max={Math.round(totalCents / 100)}
                  min="0"
                  name="paidAmount"
                  onChange={(event) => setPaidAmount(event.target.value)}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={paidAmount}
                />
              </label>
            ) : (
              <input name="paidAmount" type="hidden" value={Math.round(totalCents / 100)} />
            )}
            <label className="admin-point-field">
              <span>Notas del pedido</span>
              <input className="field" name="notes" placeholder="Remito, entrega, observaciones..." />
            </label>
            <div className="admin-detail-summary compact">
              <strong>{formatPrice(totalCents)}</strong>
              <span>
                {lines.reduce((sum, line) => sum + line.quantity, 0)} unidades | {selectedClient?.businessName ?? "Sin cliente seleccionado"} | {paymentMethodValue}
                {paymentMethod === "Cuenta corriente" ? ` | queda ${formatPrice(Math.max(0, totalCents - Math.round(parsedPaidAmount * 100)))}` : ""}
              </span>
            </div>
            <button className="button button-primary" disabled={!clientId || !lines.length} type="submit">Crear pedido y descontar stock</button>
          </form>
        </section>
        <section className="card admin-panel">
          <h2>Cuentas corrientes pendientes</h2>
          <div className="admin-product-list">
            {pendingAccountOrders.length ? pendingAccountOrders.map((order) => {
              const dueCents = Math.max(0, order.totalCents - order.paidCents);
              return (
                <form action={updateOrderPaymentAction} className="admin-table-row compact" key={order.id}>
                  <input name="id" type="hidden" value={order.id} />
                  <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
                  <input name="paymentMethod" type="hidden" value="Cuenta corriente" />
                  <div>
                    <strong>{order.customerName}</strong>
                    <small>{order.code} | pagado {formatPrice(order.paidCents)} | debe {formatPrice(dueCents)}</small>
                  </div>
                  <label className="admin-point-field">
                    <span>Pago</span>
                    <input className="field" defaultValue={Math.round(order.totalCents / 100)} min="0" name="paidAmount" step="0.01" type="number" />
                  </label>
                  <button className="button button-primary" type="submit">Cerrar pago</button>
                </form>
              );
            }) : <p className="description">No hay clientes con deuda de cuenta corriente.</p>}
          </div>
          <h2>Últimos pedidos mayoristas</h2>
          <div className="admin-product-list admin-scroll-list">
            {wholesaleOrders.length ? wholesaleOrders.map((order) => (
              <div className="admin-table-row compact" key={order.id}>
                <div>
                  <strong>{order.customerName}</strong>
                  <small>{order.code} | {order.itemCount} unidades | {formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</small>
                </div>
                <div className="admin-row-actions">
                  <span className="admin-stock-pill">{formatPrice(order.totalCents)}</span>
                  <button className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button" aria-label="Eliminar pedido mayorista"><Trash2 size={16} /></button>
                </div>
              </div>
            )) : <p className="description">Todavía no hay pedidos mayoristas.</p>}
          </div>
        </section>
      </div>
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
  const todaySales = useMemo(() => orders.filter((order) => isCashOrder(order) && order.branchId === branch.id && dateKey(toDate(order.createdAt)) === dateKey(new Date())), [branch.id, orders]);
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
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Venta mostrador",
            phone: "0000000000",
            email: "mostrador@agrovet.local",
            fulfillment: "retiro",
            branchId: branch.id,
            source: `Caja / ${paymentMethod}${paymentMethod === "Tarjeta" ? ` (${installments} cuotas)` : ""}`,
          items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No se pudo cerrar la venta.");
      setCart([]);
      setScanValue("");
      setNotice(`Venta cerrada: ${String(data.code ?? "")}`);
      push({ title: "Venta cerrada", message: String(data.code ?? ""), type: "success" });
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
            <button className="button button-primary" onClick={() => { pushVariant(scanValue); setScanValue(""); }} type="button"><PackagePlus size={18} /></button>
          </div>
        </div>
        <div className="admin-point-inline">
          <label>
            <span>Medio de pago</span>
            <select className="field" onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Transferencia</option>
              <option>QR</option>
            </select>
          </label>
          {paymentMethod === "Tarjeta" ? (
            <label>
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
          <small>{todaySales.length} ventas hoy</small>
        </div>
        {showDaySales ? (
          <div className="admin-sale-list admin-sale-list-compact">
            {todaySales.length ? todaySales.map((order) => (
              <div className="admin-table-row compact" key={order.id}>
                <div>
                  <strong>{order.code}</strong>
                  <small>{formatPrice(order.totalCents)} | {formatAdminDateTime(order.createdAt, { timeStyle: "short" })} | {order.status}</small>
                </div>
                <div className="admin-row-actions">
                  <button className="icon-button" onClick={() => onEditOrder(order)} type="button"><Pencil size={16} /></button>
                  <button className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button">
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

export function AdminConsole({
  branches,
  categories,
  initialDetail,
  initialBranchId,
  initialOrderId,
  initialNotice,
  initialSection,
  orders,
  products,
  subcategories,
  wholesaleClients,
}: {
  branches: Branch[];
  categories: Category[];
  initialDetail: string | null;
  initialBranchId: number | null;
  initialOrderId: number | null;
  initialNotice: string | null;
  initialSection: string;
  orders: OrderRecord[];
  products: Product[];
  subcategories: Subcategory[];
  wholesaleClients: WholesaleClient[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [section] = useState<Section>(initialSection === "productos" || initialSection === "categorias" || initialSection === "punto-venta" || initialSection === "ventas" || initialSection === "ventas-web" || initialSection === "clientes" ? initialSection : "resumen");
  const [selectedBranchId] = useState<number>(() => {
    const initial = initialBranchId && branches.some((branch) => branch.id === initialBranchId) ? initialBranchId : branches[0]?.id ?? 0;
    return initial;
  });
  const [branchPickerOpen, setBranchPickerOpen] = useState(() => initialBranchId ? false : true);
  const [branchPickerMandatory, setBranchPickerMandatory] = useState(() => initialBranchId ? false : true);
  const [detail, setDetail] = useState<DashboardDetail | null>(
    initialDetail === "revenue" || initialDetail === "out-stock" || initialDetail === "day-billing" || initialDetail === "pending-orders" || initialDetail === "day-history" || initialDetail === "channel-history" || initialDetail === "branch-stock"
      ? { type: initialDetail }
      : null,
  );
  const [orderToEdit, setOrderToEdit] = useState<OrderRecord | null>(() => initialOrderId ? orders.find((order) => order.id === initialOrderId) ?? null : null);
  const [orderToDelete, setOrderToDelete] = useState<OrderRecord | null>(null);
  const [webOrderStatusTarget, setWebOrderStatusTarget] = useState<{ order: OrderRecord; status: string } | null>(null);
  const [webOrderDistributionTarget, setWebOrderDistributionTarget] = useState<OrderRecord | null>(null);
  const [billingDate, setBillingDate] = useState(dateKey(new Date()));
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
  const [modal, setModal] = useState<
    | { type: "category-create"; parentCategoryId?: number }
    | { type: "category-edit"; category: Category }
    | { type: "category-delete"; category: Category; stage: 1 | 2 }
    | { type: "subcategory-create"; categoryId?: number }
    | { type: "subcategory-edit"; subcategory: Subcategory }
    | { type: "subcategory-delete"; subcategory: Subcategory; stage: 1 | 2 }
    | { type: "product-create" }
    | { type: "product-edit"; product: Product }
    | { type: "product-delete"; product: Product }
    | { type: "stock-edit"; product: Product; returnTo: string }
    | { type: "wholesale-client-create" }
    | { type: "wholesale-client-edit"; client: WholesaleClient }
    | null
  >(null);
  const [productQuery, setProductQuery] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState("");
  const [reportMonth, setReportMonth] = useState(monthKey(new Date()));
  const [reportBranch, setReportBranch] = useState(() => selectedBranchId ? String(selectedBranchId) : "all");
  const [reportChannel, setReportChannel] = useState("all");
  const [reportPayment, setReportPayment] = useState("all");
  const [webPeriod, setWebPeriod] = useState<Period>("day");
  const webPeriodStorageReady = useRef(false);
  const [webHistoryStatusFilter, setWebHistoryStatusFilter] = useState<"all" | "done" | "cancelled">("all");
  const [webHistoryTypeFilter, setWebHistoryTypeFilter] = useState<"all" | "retiro" | "envio">("all");
  const selectableProductCategories = useMemo(() => leafCategories(categories), [categories]);
  const requestDeleteOrder = (order: OrderRecord) => {
    setOrderToEdit(null);
    setOrderToDelete(order);
  };
  const availableProductSubcategories = useMemo(
    () => (productCategoryFilter && productCategoryFilter !== UNCATEGORIZED_CATEGORY_VALUE ? subcategories.filter((subcategory) => subcategory.categorySlug === productCategoryFilter) : []),
    [productCategoryFilter, subcategories],
  );
  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !query || `${product.brand} ${product.name} ${product.category} ${product.subcategory}`.toLowerCase().includes(query);
      const matchesCategory = !productCategoryFilter
        || (productCategoryFilter === UNCATEGORIZED_CATEGORY_VALUE ? !product.categorySlug : product.categorySlug === productCategoryFilter);
      const matchesSubcategory = !productSubcategoryFilter
        || (productSubcategoryFilter === UNCATEGORIZED_SUBCATEGORY_SLUG ? product.subcategorySlug === UNCATEGORIZED_SUBCATEGORY_SLUG : product.subcategorySlug === productSubcategoryFilter);
      return matchesQuery && matchesCategory && matchesSubcategory;
    });
  }, [productCategoryFilter, productQuery, productSubcategoryFilter, products]);
  const zeroStockProducts = products.filter((product) => product.variants.every((variant) => (variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0) === 0));
  const lowStockProducts = products.filter((product) => product.variants.some((variant) => {
    const quantity = variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0;
    return quantity > 0 && quantity <= 3;
  })).length;
  const totalRevenue = orders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranch.id), 0);
  const pendingOrders = orders.filter((order) => belongsToDashboardBranch(order, selectedBranch.id) && isPendingWebOrder(order));
  const webOrders = orders.filter((order) => isWebOrder(order));
  const webPeriodRange = periodBounds(webPeriod, new Date());
  const webPeriodOrders = webOrders.filter((order) => {
    const orderDate = toDate(order.createdAt);
    return orderDate >= webPeriodRange.start && orderDate < webPeriodRange.end;
  });
  const webPeriodBillableOrders = webPeriodOrders.filter((order) => !/cancelad/i.test(order.status));
  const webOrdersTotal = webPeriodBillableOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const webOrdersActive = webPeriodOrders.filter((order) => !isCancelledWebOrder(order));
  const webOrdersPending = webPeriodOrders.filter((order) => isPendingWebOrder(order));
  const webOrdersCompleted = webPeriodBillableOrders.filter((order) => isCompletedWebOrder(order));
  const webOpenOrders = webOrders.filter((order) => isPendingWebOrder(order));
  const webPickupOrders = webOpenOrders.filter((order) => isPickupWebOrder(order));
  const webDeliveryOrders = webOpenOrders.filter((order) => isDeliveryWebOrder(order));
  const webHistoryOrders = [...webPeriodOrders].filter((order) => {
    if (isPendingWebOrder(order)) return false;
    if (webHistoryStatusFilter === "done" && !isCompletedWebOrder(order)) return false;
    if (webHistoryStatusFilter === "cancelled" && !isCancelledWebOrder(order)) return false;
    if (webHistoryTypeFilter === "retiro" && !isPickupWebOrder(order)) return false;
    if (webHistoryTypeFilter === "envio" && !isDeliveryWebOrder(order)) return false;
    return true;
  }).sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  const branchRevenue = branches.map((branch) => ({
    branch: branch.name,
    value: orders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, branch.id), 0),
  }));
  const billingOrders = orders.filter((order) => dateKey(toDate(order.createdAt)) === billingDate && orderHasBranch(order, selectedBranch.id));
  const billingTotal = billingOrders.reduce((sum, order) => sum + getOrderBranchRevenueCents(order, selectedBranch.id), 0);

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

  const sectionHref = (target: Section) => buildAdminHref(pathname, { section: target, detail: null, order: null, branch: String(selectedBranch.id) });
  const detailHref = (target: DashboardDetail["type"]) => buildAdminHref(pathname, { section: "resumen", detail: target, order: null, branch: String(selectedBranch.id) });
  const detailCloseHref = buildAdminHref(pathname, { section: "resumen", detail: null, order: null, branch: String(selectedBranch.id) });
  const currentDetailHref = detail ? buildAdminHref(pathname, { section: "resumen", detail: detail.type, order: null, branch: String(selectedBranch.id) }) : detailCloseHref;
  const branchHref = (branchId: number) => buildAdminHref(pathname, { section, detail: null, order: null, branch: String(branchId) });
  const productReturnTo = sectionHref("productos");
  const rootAdminCategories = categories.filter((category) => !category.parentCategoryId);
  const orphanSubcategories = subcategories.filter((subcategory) => subcategory.categoryId === null);
  const categoryDeletionImpactById = useMemo(() => {
    const impactById = new Map<number, ReturnType<typeof getCategoryDeletionImpact>>();
    for (const category of categories) {
      impactById.set(category.id, getCategoryDeletionImpact(category, categories, subcategories, products));
    }
    return impactById;
  }, [categories, products, subcategories]);
  const flashedNotice = useRef<string | null>(null);
  useEffect(() => {
    if (!initialNotice || flashedNotice.current === initialNotice) return;
    flashedNotice.current = initialNotice;
    const categoriesHref = buildAdminHref(pathname, { section: "categorias", detail: null, order: null, branch: String(selectedBranch.id) });
    if (initialNotice === "category-deleted") {
      push({ title: "Categoría eliminada", message: "La categoría quedó desasociada y el panel volvió al listado.", type: "success" });
    } else if (initialNotice === "subcategory-deleted") {
      push({ title: "Subcategoría eliminada", message: "Los productos quedaron pendientes de reasignación.", type: "success" });
    }
    setModal(null);
    router.replace(categoriesHref);
  }, [initialNotice, pathname, push, router, selectedBranch.id]);

  const options = [
    { id: "resumen", href: sectionHref("resumen"), label: "Dashboard", icon: BarChart3 },
    { id: "productos", href: sectionHref("productos"), label: "Productos", icon: Boxes },
    { id: "categorias", href: sectionHref("categorias"), label: "Categorías", icon: FolderTree },
    { id: "punto-venta", href: sectionHref("punto-venta"), label: "Caja", icon: Grid2x2 },
    { id: "clientes", href: sectionHref("clientes"), label: "Clientes", icon: Users },
    { id: "ventas", href: sectionHref("ventas"), label: "Ventas", icon: BarChart3 },
    { id: "ventas-web", href: sectionHref("ventas-web"), label: "Ventas web", icon: Truck },
  ] as const;

  const headAction =
    section === "productos"
      ? <button className="button button-primary" onClick={() => setModal({ type: "product-create" })} type="button"><PackagePlus size={18} /> Nuevo producto</button>
      : section === "categorias"
        ? <button className="button button-primary" onClick={() => setModal({ type: "category-create" })} type="button"><PackagePlus size={18} /> Nueva categoría</button>
        : null;

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar card">
        <div className="admin-brand">
          <button className="admin-brand-mark" onClick={() => { setBranchPickerMandatory(false); setBranchPickerOpen(true); }} type="button" aria-label="Elegir sucursal">A</button>
          <div>
            <strong>Veterinaria Admin</strong>
            <span>Panel de gestión</span>
          </div>
        </div>
        <nav className="admin-nav">
          {options.map(({ id, href, label, icon: Icon }) => (
            <Link className={section === id ? "active" : ""} href={href} key={id}>
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={16} />
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="admin-logout">
          <button className="button button-light" type="submit">Cerrar sesión</button>
        </form>
      </aside>

      <main className="admin-main">
        <div className="admin-current-branch-banner">
          <span>Sucursal activa</span>
          <button className="admin-current-branch" onClick={() => { setBranchPickerMandatory(false); setBranchPickerOpen(true); }} type="button">
            {selectedBranch?.name ?? "Sucursal"}
          </button>
        </div>
        {section === "resumen" && (
          <>
            <SectionHeader subtitle="Resumen general del negocio" title="Dashboard" />
            <div className="admin-stat-grid">
              <StatCard href={detailHref("revenue")} label="Ingresos totales" value={formatPrice(totalRevenue)} note="Incluye la facturación del día y meses anteriores" />
              <StatCard href={detailHref("out-stock")} label="Sin stock" value={String(zeroStockProducts.length)} note={`${lowStockProducts} productos con stock bajo`} />
              <StatCard href={detailHref("pending-orders")} label="Pedidos pendientes" value={String(pendingOrders.length)} note="Pedidos de la web en curso" />
            </div>
            <DashboardCharts basePath={pathname} branchRevenue={branchRevenue} branches={branches} orders={orders} products={products} selectedBranchId={selectedBranch.id} />
          </>
        )}

        {section === "productos" && (
          <>
            <div id="admin-section-productos">
            <SectionHeader
              action={headAction}
              subtitle="Gestioná el inventario de tu veterinaria"
              title="Productos"
            />
            <div className="admin-toolbar">
              <label className="admin-search">
                <Search size={18} />
                <input className="field" onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar productos por nombre o categoría..." value={productQuery} />
              </label>
              <label className="admin-point-field">
                <span>Categoría</span>
                <select
                  className="field"
                  value={productCategoryFilter}
                  onChange={(event) => {
                    const next = event.target.value;
                    setProductCategoryFilter(next);
                    setProductSubcategoryFilter("");
                  }}
                >
                  <option value="">Todas</option>
                  <option value={UNCATEGORIZED_CATEGORY_VALUE}>Sin categoría</option>
                  {selectableProductCategories.map((category) => <option key={category.id} value={category.slug}>{category.parentCategoryName ? `${category.parentCategoryName} / ${category.name}` : category.name}</option>)}
                </select>
              </label>
              <label className="admin-point-field">
                <span>Subcategoría</span>
                <select className="field" disabled={!productCategoryFilter} value={productSubcategoryFilter} onChange={(event) => setProductSubcategoryFilter(event.target.value)}>
                  <option value="">{productCategoryFilter ? "Todas" : "Primero elegí una categoría"}</option>
                  {productCategoryFilter ? <option value={UNCATEGORIZED_SUBCATEGORY_SLUG}>Sin subcategoría</option> : null}
                  {availableProductSubcategories.map((subcategory) => <option key={subcategory.slug} value={subcategory.slug}>{subcategory.name}</option>)}
                </select>
              </label>
            </div>
            <div className="card admin-panel admin-table-wrap">
              <div className="admin-table-head">
                <span>Nombre</span><span>Categoría</span><span>Subcategoría</span><span>Precio</span><span>Stock</span><span>Acciones</span>
              </div>
              <div className="admin-product-list">
                {visibleProducts.map((product) => {
                  const mainVariant = product.variants[0];
                  const stockIndependencia = mainVariant?.stocks.find((stock) => stock.branchId === 1)?.quantity ?? 0;
                  const stockBelgrano = mainVariant?.stocks.find((stock) => stock.branchId === 2)?.quantity ?? 0;
                  return (
                    <div className="admin-table-row" key={product.id}>
                      <div>
                        <strong>{product.brand} {product.name}</strong>
                        <small>{product.description}</small>
                      </div>
                      <span>{product.category}</span>
                      <span>{product.subcategory}</span>
                      <strong>{formatPrice(mainVariant?.priceCents ?? 0)}</strong>
                      <span className={`admin-stock-pill admin-stock-pill-wide ${mainVariant && mainVariant.totalStock <= 3 ? "danger" : ""}`}>
                        <strong>{mainVariant?.totalStock ?? 0} unidades</strong>
                        <small>{stockIndependencia} Ind. | {stockBelgrano} Belgrano</small>
                      </span>
                      <div className="admin-row-actions">
                        <button className="icon-button" onClick={() => setModal({ type: "product-edit", product })} type="button"><Pencil size={16} /></button>
                        <button className="icon-button danger" onClick={() => setModal({ type: "product-delete", product })} type="button" aria-label="Eliminar producto"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </>
        )}

        {section === "categorias" && (
          <>
            <div id="admin-section-categorias">
            <SectionHeader action={headAction} subtitle="Organiza tus productos por categorías" title="Categorías" />
            <div className="admin-category-grid">
              {orphanSubcategories.length ? (
                <article className="card admin-category-card">
                  <div className="admin-category-top">
                    <div>
                      <strong>Subcategorías sin categoría</strong>
                      <span>Quedan listas para reasignar.</span>
                    </div>
                  </div>
                  <div className="admin-subcategory-summary">
                    {orphanSubcategories.length} subcategorías pendientes
                  </div>
                  <div className="admin-subcategory-grid">
                    {orphanSubcategories.map((subcategory) => (
                      <article className="admin-subcategory-card" key={`orphan-${subcategory.slug}`}>
                        <strong>{subcategory.name}</strong>
                        <span>{subcategory.description || "Sin descripción"}</span>
                        <small>{subcategory.count} productos</small>
                        <div className="admin-subcategory-actions">
                          <button className="icon-button" onClick={() => setModal({ type: "subcategory-edit", subcategory })} type="button"><Pencil size={15} /></button>
                          <button className="icon-button danger" onClick={() => setModal({ type: "subcategory-delete", subcategory, stage: 1 })} type="button"><Trash2 size={15} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ) : null}
              {rootAdminCategories.map((category) => {
                const isFixedSpecialCategory = isSpecialCategorySlug(category.slug);
                const childCategories = categories.filter((item) => item.parentCategoryId === category.id);
                const displayCategories = [category, ...childCategories];
                const subcategoryList = displayCategories.flatMap((item) => subcategories.filter((subcategory) => subcategory.categorySlug === item.slug));
                return (
                  <article className="card admin-category-card" key={category.id}>
                    <div className="admin-category-top">
                      <div>
                        <strong>{category.name}</strong>
                        <span>{category.description || "Sin descripción"}</span>
                      </div>
                      {isFixedSpecialCategory ? <span className="admin-fixed-badge">{category.showInMenu ? "Página fija visible" : "Página fija oculta"}</span> : (
                        <button className="admin-chevron" onClick={() => setModal({ type: "subcategory-create", categoryId: category.id })} type="button">
                          <ChevronRight size={18} />
                        </button>
                      )}
                    </div>
                    <div className="admin-subcategory-summary">
                      {isFixedSpecialCategory ? (category.showInMenu ? "Aparece al final del menú público" : "No aparece en el menú público") : `${childCategories.length ? `${childCategories.length} categorías internas | ` : ""}${subcategoryList.length} subcategorías`}
                    </div>
                    <div className="admin-card-actions">
                      {!isFixedSpecialCategory ? (
                        <>
                          <button className="button button-light" onClick={() => setModal({ type: "category-create", parentCategoryId: category.id })} type="button"><PackagePlus size={16} /> Nueva categoría interna</button>
                          <button className="button button-light" onClick={() => setModal({ type: "subcategory-create", categoryId: category.id })} type="button"><PackagePlus size={16} /> Nueva subcategoría</button>
                        </>
                      ) : null}
                      {isFixedSpecialCategory ? <SpecialCategoryVisibilityToggle category={category} returnTo={sectionHref("categorias")} /> : null}
                      <button className="button button-light" onClick={() => setModal({ type: "category-edit", category })} type="button"><Pencil size={16} /> Editar</button>
                      {!isFixedSpecialCategory ? (
                        <button className="button button-light danger" onClick={() => setModal({ type: "category-delete", category, stage: categoryDeletionImpactById.get(category.id)?.hasContents ? 1 : 2 })} type="button"><Trash2 size={16} /> Eliminar</button>
                      ) : null}
                    </div>
                    <div className="admin-subcategory-grid">
                      {displayCategories.flatMap((item) => {
                        const itemSubcategories = subcategories.filter((subcategory) => subcategory.categorySlug === item.slug);
                        const categoryCard = item.id !== category.id ? [(
                          <article className="admin-subcategory-card" key={`category-${item.id}`}>
                            <strong>{item.name}</strong>
                            <span>{item.description || "Categoría interna"}</span>
                            <small>{itemSubcategories.length} subcategorías</small>
                            <div className="admin-subcategory-actions">
                              <button className="icon-button" onClick={() => setModal({ type: "subcategory-create", categoryId: item.id })} type="button"><PackagePlus size={15} /></button>
                              <button className="icon-button" onClick={() => setModal({ type: "category-edit", category: item })} type="button"><Pencil size={15} /></button>
                              <button className="icon-button danger" onClick={() => setModal({ type: "category-delete", category: item, stage: categoryDeletionImpactById.get(item.id)?.hasContents ? 1 : 2 })} type="button"><Trash2 size={15} /></button>
                            </div>
                          </article>
                        )] : [];
                        return [
                          ...categoryCard,
                          ...itemSubcategories.map((subcategory) => (
                        <article className="admin-subcategory-card" key={subcategory.slug}>
                          <strong>{childCategories.length ? `${item.name} / ${subcategory.name}` : subcategory.name}</strong>
                          <span>{subcategory.description || "Sin descripción"}</span>
                          <small>{subcategory.count} productos</small>
                          <div className="admin-subcategory-actions">
                            <button className="icon-button" onClick={() => setModal({ type: "subcategory-edit", subcategory })} type="button"><Pencil size={15} /></button>
                            <button className="icon-button danger" onClick={() => setModal({ type: "subcategory-delete", subcategory, stage: 1 })} type="button"><Trash2 size={15} /></button>
                          </div>
                        </article>
                          )),
                        ];
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            </div>
          </>
        )}

        {section === "punto-venta" && (
          <>
            <div id="admin-section-punto-venta">
            <SectionHeader subtitle="Registra ventas desde el scanner y el código de barras" title="Caja" />
            <PointOfSalePanel branch={selectedBranch} onDeleteOrder={requestDeleteOrder} onEditOrder={setOrderToEdit} orders={orders} products={products} />
            </div>
          </>
        )}

        {section === "clientes" && (
          <div id="admin-section-clientes">
            <WholesaleClientsPanel
              basePath={pathname}
              branches={branches}
              clients={wholesaleClients}
              onDeleteOrder={requestDeleteOrder}
              onEditClient={(client) => setModal({ type: "wholesale-client-edit", client })}
              onCreateClient={() => setModal({ type: "wholesale-client-create" })}
              orders={orders}
              products={products}
              selectedBranch={selectedBranch}
            />
          </div>
        )}

        {section === "ventas" && (
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
                        <button className="icon-button" onClick={() => setOrderToEdit(order)} type="button"><Pencil size={16} /></button>
                        <button className="icon-button danger" onClick={() => requestDeleteOrder(order)} type="button"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card admin-panel">
                <h2>Pedidos pendientes</h2>
                <p className="description">Control de pedidos abiertos con seguimiento de retiro y envío.</p>
                <div className="notice">{pendingOrders.length} pedidos activos.</div>
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
        )}

        {section === "ventas-web" && (
          <>
            <div id="admin-section-ventas-web">
            <SectionHeader
              action={(
                <div className="admin-period-toggle" role="tablist" aria-label="Periodo de ventas web">
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
                              onCompleteOrder={(nextOrder, status) => setWebOrderStatusTarget({ order: nextOrder, status })}
                              onEditDistribution={(nextOrder) => setWebOrderDistributionTarget(nextOrder)}
                              onSelectOrder={setOrderToEdit}
                              branchId={branch.id}
                              order={order}
                              returnTo={sectionHref("ventas-web")}
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
                              onCompleteOrder={(nextOrder, status) => setWebOrderStatusTarget({ order: nextOrder, status })}
                              onEditDistribution={(nextOrder) => setWebOrderDistributionTarget(nextOrder)}
                              onSelectOrder={setOrderToEdit}
                              branchId={branch.id}
                              order={order}
                              returnTo={sectionHref("ventas-web")}
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
                      onSelectOrder={setOrderToEdit}
                      order={order}
                      returnTo={sectionHref("ventas-web")}
                      showStatusActions={false}
                    />
                  )) : <p className="description">No hay pedidos web para el período seleccionado.</p>}
                </div>
              </section>
            </div>
            </div>
          </>
        )}
      </main>

      {branchPickerOpen ? (
        <BranchPickerModal
          branchHref={branchHref}
          branches={branches}
          mandatory={branchPickerMandatory}
          onSelect={() => {
            setBranchPickerOpen(false);
            setBranchPickerMandatory(false);
          }}
          onClose={() => {
            setBranchPickerOpen(false);
            setBranchPickerMandatory(false);
          }}
          selectedBranchId={selectedBranch.id}
        />
      ) : null}
      {modal?.type === "category-create" ? <CategoryModal categories={categories} mode="create" onClose={() => setModal(null)} parentCategoryId={modal.parentCategoryId} returnTo={sectionHref("categorias")} /> : null}
      {modal?.type === "category-edit" ? <CategoryModal categories={categories} category={modal.category} mode="edit" onClose={() => setModal(null)} returnTo={sectionHref("categorias")} /> : null}
      {modal?.type === "category-delete" ? (
        <CategoryDeleteModal
          category={modal.category}
          impact={categoryDeletionImpactById.get(modal.category.id) ?? getCategoryDeletionImpact(modal.category, categories, subcategories, products)}
          returnTo={sectionHref("categorias")}
          onClose={() => setModal(null)}
          onContinue={() => setModal({ type: "category-delete", category: modal.category, stage: 2 })}
          stage={modal.stage}
        />
      ) : null}
      {modal?.type === "subcategory-create" ? <SubcategoryModal categories={categories} categoryId={modal.categoryId} mode="create" onClose={() => setModal(null)} returnTo={sectionHref("categorias")} /> : null}
      {modal?.type === "subcategory-edit" ? <SubcategoryModal categories={categories} mode="edit" onClose={() => setModal(null)} returnTo={sectionHref("categorias")} subcategory={modal.subcategory} /> : null}
      {modal?.type === "subcategory-delete" ? (
        <SubcategoryDeleteModal
          impact={getSubcategoryDeletionImpact(modal.subcategory, products)}
          returnTo={sectionHref("categorias")}
          onClose={() => setModal(null)}
          onContinue={() => setModal({ type: "subcategory-delete", subcategory: modal.subcategory, stage: 2 })}
          stage={modal.stage}
          subcategory={modal.subcategory}
        />
      ) : null}
      {modal?.type === "product-create" ? <ProductModal categories={categories} mode="create" onClose={() => setModal(null)} returnTo={productReturnTo} subcategories={subcategories} /> : null}
      {modal?.type === "product-edit" ? <ProductModal categories={categories} mode="edit" onClose={() => setModal(null)} product={modal.product} returnTo={productReturnTo} subcategories={subcategories} /> : null}
      {modal?.type === "product-delete" ? <ProductDeleteModal onClose={() => setModal(null)} product={modal.product} /> : null}
      {modal?.type === "stock-edit" ? <StockEditModal branch={selectedBranch} branches={branches} onClose={() => setModal(null)} product={modal.product} returnTo={modal.returnTo} /> : null}
      {modal?.type === "wholesale-client-create" ? <WholesaleClientModal onClose={() => setModal(null)} returnTo={sectionHref("clientes")} /> : null}
      {modal?.type === "wholesale-client-edit" ? <WholesaleClientModal client={modal.client} onClose={() => setModal(null)} returnTo={sectionHref("clientes")} /> : null}
      {webOrderStatusTarget ? (
        <WebOrderStatusModal
          onClose={() => setWebOrderStatusTarget(null)}
          order={webOrderStatusTarget.order}
          returnTo={sectionHref("ventas-web")}
          status={webOrderStatusTarget.status as "Entregado" | "Retirado"}
        />
      ) : null}
      {webOrderDistributionTarget ? (
        <WebOrderDistributionModal
          branches={branches}
          onClose={() => setWebOrderDistributionTarget(null)}
          order={webOrderDistributionTarget}
          products={products}
          returnTo={sectionHref("ventas-web")}
        />
      ) : null}
      {detail ? (
        <DashboardDetailModal
          closeHref={detailCloseHref}
          currentHref={currentDetailHref}
          branches={branches}
          detail={detail}
          onClose={() => {
            setDetail(null);
            router.replace(detailCloseHref);
          }}
          onCompleteOrder={(order, status) => setWebOrderStatusTarget({ order, status })}
          onEditStock={(product) => setModal({ type: "stock-edit", product, returnTo: currentDetailHref })}
          onSelectOrder={(order) => setOrderToEdit(order)}
          orders={orders}
          products={products}
          selectedBranch={selectedBranch}
        />
      ) : null}
      {orderToEdit ? <OrderModal key={orderToEdit.id} onClose={() => setOrderToEdit(null)} onRequestDelete={requestDeleteOrder} order={orderToEdit} returnTo={sectionHref("punto-venta")} /> : null}
      {orderToDelete ? <DeleteOrderModal onClose={() => setOrderToDelete(null)} order={orderToDelete} /> : null}
    </div>
  );
}



