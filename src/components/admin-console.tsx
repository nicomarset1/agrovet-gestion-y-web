"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  ChevronsLeft,
  MapPin,
  FolderTree,
  Grid2x2,
  Truck,
  Trash2,
  RotateCcw,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Branch, Category, OrderRecord, Product, TrashItem, WholesaleClient } from "@/lib/types";
import { useToast } from "@/components/toast-provider";
import { logoutAction } from "@/app/gestion-agrovet/actions";
import { BranchPickerModal, DeleteOrderModal, OrderModal, StockEditModal, WebOrderDistributionModal, WebOrderStatusModal, belongsToDashboardBranch, buildAdminHref, isPendingWebOrder, trashTypeSingular } from "@/components/admin/shared";
import type { AdminModalState, DashboardDetail, Section, Subcategory, WebOrderStatus } from "@/components/admin/shared";
import { DashboardDetailModal, DashboardSection } from "@/components/admin/dashboard";
import { ProductDeleteModal, ProductModal, ProductsSection } from "@/components/admin/productos";
import { CategoriesSection, CategoryDeleteModal, CategoryModal, SubcategoryDeleteModal, SubcategoryModal, getCategoryDeletionImpact, getSubcategoryDeletionImpact } from "@/components/admin/categorias";
import { EmptyTrashModal, PapeleraSection, RestoreTrashItemModal } from "@/components/admin/papelera";
import { WholesaleClientModal, WholesaleClientsPanel } from "@/components/admin/clientes";
import { CajaSection } from "@/components/admin/caja";
import { VentasSection } from "@/components/admin/ventas";
import { VentasWebSection } from "@/components/admin/ventas-web";

// Cola de cada ítem del menú: chevron y, mientras la sección carga, un indicador.
function AdminNavTail() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" className={`admin-nav-tail${pending ? " is-pending" : ""}`}>
      <ChevronRight size={16} />
    </span>
  );
}

// Movimiento del panel. La cascada de entrada va solo la primera vez que se abre el panel en la
// pestaña; al cambiar de sección hay un fundido corto y el live-sync no anima nada (no remonta).
let panelEnteredThisSession = false;

const PANEL_ENTERED_STORAGE_KEY = "agrovet-panel-entered";

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
  trashItems,
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
  trashItems: TrashItem[];
  wholesaleClients: WholesaleClient[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [section] = useState<Section>(initialSection === "productos" || initialSection === "categorias" || initialSection === "punto-venta" || initialSection === "ventas" || initialSection === "ventas-web" || initialSection === "clientes" || initialSection === "papelera" ? initialSection : "resumen");
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
  const [trashItemToRestore, setTrashItemToRestore] = useState<TrashItem | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [webOrderStatusTarget, setWebOrderStatusTarget] = useState<{ order: OrderRecord; status: WebOrderStatus } | null>(null);
  const [webOrderDistributionTarget, setWebOrderDistributionTarget] = useState<OrderRecord | null>(null);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
  const [modal, setModal] = useState<AdminModalState>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("agrovet-sidebar-collapsed");
    } catch {
      stored = null;
    }
    if (stored === "1") queueMicrotask(() => setSidebarCollapsed(true));
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      try {
        window.localStorage.setItem("agrovet-sidebar-collapsed", current ? "0" : "1");
      } catch {
        // Sin almacenamiento, la preferencia dura hasta recargar.
      }
      return !current;
    });
  };
  // Mientras el selector de sucursal obligatorio tapa el panel, la entrada no cuenta: la cascada se
  // ve recién cuando el panel queda a la vista.
  const coveredByBranchPicker = !initialBranchId;
  const [panelMotion, setPanelMotion] = useState<"enter" | "switch" | null>(() => (panelEnteredThisSession ? "switch" : "enter"));
  useEffect(() => {
    if (coveredByBranchPicker) return;
    panelEnteredThisSession = true;
    try {
      window.sessionStorage.setItem(PANEL_ENTERED_STORAGE_KEY, "1");
    } catch {
      // Sin sessionStorage, una recarga vuelve a mostrar la cascada: no rompe nada.
    }
    // Al terminar se saca la clase para que remontar partes (por ejemplo, al cambiar el período)
    // no repita la cascada.
    const timer = window.setTimeout(() => setPanelMotion(null), 700);
    return () => window.clearTimeout(timer);
  }, [coveredByBranchPicker]);
  const adminMenuToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!adminMenuOpen) return;
    // En celular el menú lateral se cierra con Escape y el foco vuelve al botón que lo abrió.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(".admin-modal-backdrop")) return;
      setAdminMenuOpen(false);
      adminMenuToggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adminMenuOpen]);
  const requestDeleteOrder = (order: OrderRecord) => {
    setOrderToEdit(null);
    setOrderToDelete(order);
  };
  const stockTrackedProducts = products.filter((product) => product.active);
  const zeroStockPresentations = stockTrackedProducts.flatMap((product) => product.variants).filter((variant) => (variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0) === 0);
  const lowStockPresentations = stockTrackedProducts.flatMap((product) => product.variants).filter((variant) => {
    const quantity = variant.stocks.find((stock) => stock.branchId === selectedBranch.id)?.quantity ?? 0;
    return quantity > 0 && quantity <= 3;
  }).length;
  const pendingOrders = orders.filter((order) => belongsToDashboardBranch(order, selectedBranch.id) && isPendingWebOrder(order));
  const sectionHref = (target: Section) => buildAdminHref(pathname, { section: target, detail: null, order: null, branch: String(selectedBranch.id) });
  const detailCloseHref = buildAdminHref(pathname, { section: "resumen", detail: null, order: null, branch: String(selectedBranch.id) });
  const currentDetailHref = detail ? buildAdminHref(pathname, { section: "resumen", detail: detail.type, order: null, branch: String(selectedBranch.id) }) : detailCloseHref;
  const branchHref = (branchId: number) => buildAdminHref(pathname, { section, detail: null, order: null, branch: String(branchId) });
  const productReturnTo = sectionHref("productos");
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
    const currentSectionHref = buildAdminHref(pathname, { section, detail: null, order: null, branch: String(selectedBranch.id) });
    let clearFlashHref = currentSectionHref;
    if (initialNotice === "category-deleted") {
      push({ title: "Categoría eliminada", message: "La categoría quedó desasociada y el panel volvió al listado.", type: "success" });
      clearFlashHref = categoriesHref;
    } else if (initialNotice === "subcategory-deleted") {
      push({ title: "Subcategoría eliminada", message: "Los productos quedaron pendientes de reasignación.", type: "success" });
      clearFlashHref = categoriesHref;
    } else if (initialNotice.startsWith("restored-")) {
      const restoredType = initialNotice.replace("restored-", "") as TrashItem["type"];
      push({ title: "Elemento restaurado", message: `Se restauró el ${trashTypeSingular(restoredType)}.`, type: "success", icon: RotateCcw });
    } else if (initialNotice === "trash-emptied") {
      push({ title: "Papelera vaciada", message: "Los elementos se borraron permanentemente.", type: "success", icon: Trash2 });
    }
    setModal(null);
    router.replace(clearFlashHref);
  }, [initialNotice, pathname, push, router, section, selectedBranch.id]);

  const options = [
    { id: "resumen", href: sectionHref("resumen"), label: "Dashboard", icon: BarChart3 },
    { id: "productos", href: sectionHref("productos"), label: "Productos", icon: Boxes },
    { id: "categorias", href: sectionHref("categorias"), label: "Categorías", icon: FolderTree },
    { id: "punto-venta", href: sectionHref("punto-venta"), label: "Caja", icon: Grid2x2 },
    { id: "clientes", href: sectionHref("clientes"), label: "Clientes", icon: Users },
    { id: "ventas", href: sectionHref("ventas"), label: "Ventas", icon: BarChart3 },
    { id: "ventas-web", href: sectionHref("ventas-web"), label: "Ventas web", icon: Truck },
    { id: "papelera", href: sectionHref("papelera"), label: "Papelera", icon: Trash2 },
  ] as const;

  return (
    // "admin-section-swap" y no "admin-switch": esa clase es el interruptor viejo de globals.css (fondo
    // blanco, letra en 800, borde) y durante la animación le cambiaba el aspecto a todo el panel.
    <div className={`admin-layout${panelMotion === "enter" ? " admin-enter" : panelMotion === "switch" ? " admin-section-swap" : ""}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside aria-label="Panel de gestión" className={`admin-sidebar card${adminMenuOpen ? " open" : ""}`}>
        <div className="admin-brand">
          <button className="admin-brand-mark" onClick={() => { setBranchPickerMandatory(false); setBranchPickerOpen(true); }} type="button" aria-label="Elegir sucursal" />
          <div>
            <strong>Veterinaria Admin</strong>
            <span>Panel de gestión</span>
          </div>
          <button
            aria-expanded={adminMenuOpen}
            aria-label={adminMenuOpen ? "Cerrar panel de gestión" : "Abrir panel de gestión"}
            className="admin-menu-toggle"
            ref={adminMenuToggleRef}
            onClick={() => setAdminMenuOpen((current) => !current)}
            type="button"
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <button
          aria-label={`Sucursal activa: ${selectedBranch?.name ?? "Sucursal"}. Cambiar sucursal`}
          className="admin-branch-switch"
          onClick={() => { setBranchPickerMandatory(false); setBranchPickerOpen(true); }}
          title="Cambiar sucursal"
          type="button"
        >
          <MapPin size={16} />
          <span className="admin-branch-switch-copy">
            <small>Sucursal activa</small>
            <strong>{selectedBranch?.name ?? "Sucursal"}</strong>
          </span>
        </button>
        <div className="admin-sidebar-body">
          <nav aria-label="Secciones" className="admin-nav">
            {options.map(({ id, href, label, icon: Icon }) => (
              <Link className={section === id ? "active" : ""} href={href} key={id} title={sidebarCollapsed ? label : undefined}>
                <Icon size={18} />
                <span>{label}</span>
                <AdminNavTail />
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="admin-logout">
            <button className="button button-light" type="submit">Cerrar sesión</button>
          </form>
          <button
            aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            aria-pressed={sidebarCollapsed}
            className="admin-sidebar-collapse"
            onClick={toggleSidebar}
            type="button"
          >
            <ChevronsLeft size={16} />
            <span>Contraer menú</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        {section === "resumen" && (
          <DashboardSection
            basePath={pathname}
            branches={branches}
            lowStockCount={lowStockPresentations}
            orders={orders}
            pendingCount={pendingOrders.length}
            selectedBranch={selectedBranch}
            zeroStockCount={zeroStockPresentations.length}
          />
        )}

        {section === "productos" && (
          <ProductsSection
            categories={categories}
            openModal={setModal}
            productReturnTo={productReturnTo}
            products={products}
            subcategories={subcategories}
          />
        )}

        {section === "categorias" && (
          <CategoriesSection
            categories={categories}
            categoryDeletionImpactById={categoryDeletionImpactById}
            openModal={setModal}
            products={products}
            returnTo={sectionHref("categorias")}
            subcategories={subcategories}
          />
        )}

        {section === "punto-venta" && (
          <CajaSection branch={selectedBranch} onDeleteOrder={requestDeleteOrder} onEditOrder={setOrderToEdit} orders={orders} products={products} />
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
          <VentasSection
            branches={branches}
            onDeleteOrder={requestDeleteOrder}
            onEditOrder={setOrderToEdit}
            orders={orders}
            selectedBranch={selectedBranch}
          />
        )}

        {section === "ventas-web" && (
          <VentasWebSection
            branches={branches}
            onEditDistribution={setWebOrderDistributionTarget}
            onEditOrder={setOrderToEdit}
            onStatusTarget={setWebOrderStatusTarget}
            orders={orders}
            returnTo={sectionHref("ventas-web")}
          />
        )}

        {section === "papelera" && (
          <PapeleraSection onEmptyTrash={() => setEmptyTrashOpen(true)} onRestore={setTrashItemToRestore} trashItems={trashItems} />
        )}
      </div>

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
      {trashItemToRestore ? <RestoreTrashItemModal item={trashItemToRestore} onClose={() => setTrashItemToRestore(null)} returnTo={sectionHref("papelera")} /> : null}
      {emptyTrashOpen ? <EmptyTrashModal count={trashItems.length} items={trashItems} onClose={() => setEmptyTrashOpen(false)} returnTo={sectionHref("papelera")} /> : null}
      {modal?.type === "stock-edit" ? <StockEditModal branch={selectedBranch} onClose={() => setModal(null)} product={modal.product} variantId={modal.variantId} returnTo={modal.returnTo} /> : null}
      {modal?.type === "wholesale-client-create" ? <WholesaleClientModal onClose={() => setModal(null)} returnTo={sectionHref("clientes")} /> : null}
      {modal?.type === "wholesale-client-edit" ? <WholesaleClientModal client={modal.client} onClose={() => setModal(null)} returnTo={sectionHref("clientes")} /> : null}
      {webOrderStatusTarget ? (
        <WebOrderStatusModal
          onClose={() => setWebOrderStatusTarget(null)}
          order={webOrderStatusTarget.order}
          returnTo={sectionHref("ventas-web")}
          status={webOrderStatusTarget.status}
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
          onEditStock={(product, variantId) => setModal({ type: "stock-edit", product, variantId, returnTo: currentDetailHref })}
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
