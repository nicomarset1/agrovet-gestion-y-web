"use client";

// Panel de gestión: sección Categorías (categorías principales, categorías internas y subcategorías).
//
// Cómo funciona el modelo (lib/db): una categoría "principal" tiene show_in_menu y no tiene padre;
// una categoría "interna" no tiene show_in_menu y cuelga de una principal. Las subcategorías cuelgan
// de cualquiera de las dos. Las páginas fijas (Envíos, Contacto…) son categorías especiales que solo
// se prenden o apagan. En el menú público, las internas de Perros y Gatos aparecen solo con 5
// productos o más de esa especie (customer-catalog-menu.ts); el árbol lo avisa en cada fila.

import { AlertTriangle, ChevronRight, FilePlus2, FolderInput, FolderPlus, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { isSpecialCategorySlug } from "@/lib/special-categories";
import type { Category, Product } from "@/lib/types";
import { createCategoryAction, createSubcategoryAction, deleteCategoryAction, deleteSubcategoryAction, updateCategoryAction, updateSubcategoryAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, leafCategories } from "@/components/admin/shared";
import type { AdminModalState, Subcategory } from "@/components/admin/shared";
import { Checkbox, Switch } from "@/components/ui/form-controls";
import { MenuButton, type MenuItem } from "@/components/ui/menu-button";
import { Select, type SelectItem } from "@/components/ui/select";

/** Mínimo de productos de la especie para que una categoría interna de Perros o Gatos salga en el menú público. */
const MENU_MIN_PRODUCTS = 5;
const PET_ROOTS = ["perro", "gato"];

export function getCategoryDeletionImpact(category: Category, categories: Category[], subcategories: Subcategory[], products: Product[]) {
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

export function getSubcategoryDeletionImpact(subcategory: Subcategory, products: Product[]) {
  const affectedProducts = products.filter((product) => product.subcategorySlug === subcategory.slug);
  return {
    productCount: affectedProducts.length,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Opciones jerárquicas para elegir dónde va una subcategoría: principal › interna. */
function subcategoryParentOptions(categories: Category[]): SelectItem[] {
  const selectable = leafCategories(categories);
  const roots = selectable.filter((category) => !category.parentCategoryId).sort(byName);
  return roots.flatMap((root) => [
    { value: String(root.id), label: root.name },
    ...selectable
      .filter((category) => category.parentCategoryId === root.id)
      .sort(byName)
      .map((child) => ({ value: String(child.id), label: child.name, depth: 1, path: `${root.name} › ${child.name}` })),
  ]);
}

export function CategoryDeleteModal({
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
          <span>{category.parentCategoryName ? `${category.parentCategoryName} › ${category.name}` : category.name}</span>
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

export function SubcategoryDeleteModal({
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
          <span>{subcategory.categoryName ? `${subcategory.categoryName} › ${subcategory.name}` : subcategory.name}</span>
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

export function CategoryModal({
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
  const title = mode === "create" ? "Nueva categoría" : "Editar categoría";
  const action = mode === "create" ? createCategoryAction : updateCategoryAction;
  const isFixedSpecialCategory = category ? isSpecialCategorySlug(category.slug) : false;
  const [showInMenu, setShowInMenu] = useState(category ? category.showInMenu : !parentCategoryId);
  const rootCategories = categories.filter((item) => item.showInMenu && !item.parentCategoryId && item.id !== category?.id && !isSpecialCategorySlug(item.slug)).sort(byName);
  const defaultParentCategoryId = category?.parentCategoryId ?? parentCategoryId ?? rootCategories[0]?.id ?? "";
  return (
    <AdminModal
      onClose={onClose}
      subtitle={isFixedSpecialCategory ? "Esta página fija conserva su ubicación y destino especial." : mode === "create" ? "Creá una categoría principal o una categoría interna dentro de otra." : "Ajustá nombre, ubicación, slug y descripción."}
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
            <div className="admin-span-2">
              <Checkbox
                checked={showInMenu}
                hint="Si no, queda como categoría interna dentro de otra."
                label="Categoría principal del menú"
                name="showInMenu"
                onChange={(event) => setShowInMenu(event.target.checked)}
              />
            </div>
          </>
        ) : (
          <label className="admin-field admin-span-2">
            <span>Contenido de la página</span>
            <textarea
              className="field"
              defaultValue={category?.description ?? ""}
              name="description"
              placeholder="Escribí el texto que se va a mostrar en esta página fija. Separá párrafos con Enter."
              rows={8}
            />
          </label>
        )}
        {!isFixedSpecialCategory && !showInMenu ? (
          <div className="admin-field admin-span-2">
            <span id="category-parent-label">Dentro de la categoría principal</span>
            <Select
              ariaLabelledBy="category-parent-label"
              defaultValue={defaultParentCategoryId ? String(defaultParentCategoryId) : ""}
              name="parentCategoryId"
              options={rootCategories.map((item) => ({ value: String(item.id), label: item.name }))}
              placeholder={rootCategories.length ? "Elegí una categoría" : "Primero creá una categoría principal"}
              required
            />
          </div>
        ) : null}
        <div className="admin-modal-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{mode === "create" ? "Crear categoría" : "Guardar cambios"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function SubcategoryModal({
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
  const title = mode === "create" ? "Nueva subcategoría" : "Editar subcategoría";
  const selectedCategoryId = categoryId ?? subcategory?.categoryId ?? "";
  return (
    <AdminModal
      onClose={onClose}
      subtitle={mode === "create" ? "Asigná una subcategoría a una categoría." : "Mové o renombrá la subcategoría."}
      title={title}
    >
      <form action={action} className="admin-modal-form">
        {mode === "edit" && subcategory ? <input name="oldSlug" type="hidden" value={subcategory.slug} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="admin-field">
          <span id="subcategory-parent-label">Categoría</span>
          <Select
            ariaLabelledBy="subcategory-parent-label"
            defaultValue={selectedCategoryId ? String(selectedCategoryId) : ""}
            name="categoryId"
            options={subcategoryParentOptions(categories)}
            placeholder="Elegí una categoría"
            required
          />
        </div>
        <label className="admin-field">
          <span>Nombre de la subcategoría</span>
          <input className="field" defaultValue={subcategory?.name ?? ""} name="name" placeholder="Ej: Cachorros" required />
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

/** Campos ocultos para volver a guardar una categoría sin cambiar nada más que lo que se edita. */
function CategoryHiddenFields({ category, returnTo, parentOverride, showInMenuOverride }: {
  category: Category;
  returnTo: string;
  parentOverride?: number | null;
  showInMenuOverride?: boolean;
}) {
  const showInMenu = showInMenuOverride ?? category.showInMenu;
  const parent = parentOverride !== undefined ? parentOverride : category.parentCategoryId;
  return (
    <>
      <input name="id" type="hidden" value={category.id} />
      <input name="slug" type="hidden" value={category.slug} />
      <input name="description" type="hidden" value={category.description ?? ""} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {showInMenu ? <input name="showInMenu" type="hidden" value="on" /> : null}
      {!showInMenu && parent ? <input name="parentCategoryId" type="hidden" value={parent} /> : null}
    </>
  );
}

type RenameTarget = { kind: "category"; category: Category } | { kind: "subcategory"; subcategory: Subcategory };
type MoveTarget = { kind: "category"; category: Category; hasChildren: boolean } | { kind: "subcategory"; subcategory: Subcategory };

/** Renombrar en la misma fila: Enter guarda, Escape cancela. Usa las server actions de siempre. */
function InlineRename({ target, returnTo, onCancel }: { target: RenameTarget; returnTo: string; onCancel: () => void }) {
  const currentName = target.kind === "category" ? target.category.name : target.subcategory.name;
  return (
    <form
      action={target.kind === "category" ? updateCategoryAction : updateSubcategoryAction}
      className="admin-cat-rename"
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
    >
      {target.kind === "category" ? (
        <CategoryHiddenFields category={target.category} returnTo={returnTo} />
      ) : (
        <>
          <input name="oldSlug" type="hidden" value={target.subcategory.slug} />
          <input name="categoryId" type="hidden" value={target.subcategory.categoryId ?? ""} />
          <input name="description" type="hidden" value={target.subcategory.description ?? ""} />
          <input name="returnTo" type="hidden" value={returnTo} />
        </>
      )}
      <input aria-label={`Nuevo nombre para ${currentName}`} autoFocus className="field" defaultValue={currentName} maxLength={80} minLength={2} name="name" required />
      <button aria-label="Guardar nombre" className="icon-button" type="submit">✓</button>
      <button aria-label="Cancelar" className="icon-button" onClick={onCancel} type="button"><X size={15} /></button>
    </form>
  );
}

/** "Mover a…": elegir el nuevo lugar con el Select jerárquico y guardar con la misma server action. */
function MoveDialog({ target, categories, returnTo, onClose }: { target: MoveTarget; categories: Category[]; returnTo: string; onClose: () => void }) {
  const [destination, setDestination] = useState("");
  if (target.kind === "subcategory") {
    const { subcategory } = target;
    const options = subcategoryParentOptions(categories).filter((item) => !("value" in item) || item.value !== String(subcategory.categoryId));
    return (
      <AdminModal onClose={onClose} subtitle={`Los productos de "${subcategory.name}" se mueven con ella.`} title={subcategory.categoryId ? "Mover subcategoría" : "Asignar subcategoría"}>
        <form action={updateSubcategoryAction} className="admin-modal-form">
          <input name="oldSlug" type="hidden" value={subcategory.slug} />
          <input name="name" type="hidden" value={subcategory.name} />
          <input name="description" type="hidden" value={subcategory.description ?? ""} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div className="admin-field admin-span-2">
            <span id="move-sub-label">Mover a</span>
            <Select ariaLabelledBy="move-sub-label" name="categoryId" onChange={setDestination} options={options} placeholder="Elegí la categoría" required value={destination} />
          </div>
          <div className="admin-modal-actions">
            <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
            <button className="button button-primary" disabled={!destination} type="submit">Mover</button>
          </div>
        </form>
      </AdminModal>
    );
  }
  const { category, hasChildren } = target;
  const roots = categories.filter((item) => item.showInMenu && !item.parentCategoryId && item.id !== category.id && !isSpecialCategorySlug(item.slug)).sort(byName);
  const options: SelectItem[] = [
    ...(category.parentCategoryId ? [{ value: "root", label: "Categoría principal del menú" }] : []),
    ...roots.filter((root) => root.id !== category.parentCategoryId).map((root) => ({
      value: String(root.id),
      label: `Dentro de ${root.name}`,
      disabled: hasChildren,
    })),
  ];
  return (
    <AdminModal onClose={onClose} subtitle={`Sus subcategorías y productos se mueven con "${category.name}".`} title="Mover categoría">
      <form action={updateCategoryAction} className="admin-modal-form">
        <CategoryHiddenFields
          category={category}
          parentOverride={destination && destination !== "root" ? Number(destination) : null}
          returnTo={returnTo}
          showInMenuOverride={destination === "root" ? true : destination ? false : category.showInMenu}
        />
        <input name="name" type="hidden" value={category.name} />
        <div className="admin-field admin-span-2">
          <span id="move-cat-label">Mover a</span>
          <Select ariaLabelledBy="move-cat-label" onChange={setDestination} options={options} placeholder="Elegí dónde va" value={destination} />
          {hasChildren ? <small className="admin-cat-note">Tiene categorías internas: primero movelas, porque una categoría interna no puede tener otras adentro.</small> : null}
        </div>
        <div className="admin-modal-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" disabled={!destination} type="submit">Mover</button>
        </div>
      </form>
    </AdminModal>
  );
}

function SpecialPageSwitch({ category, returnTo }: { category: Category; returnTo: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={updateCategoryAction} className="admin-switch-form" ref={formRef}>
      <input name="id" type="hidden" value={category.id} />
      <input name="name" type="hidden" value={category.name} />
      <input name="slug" type="hidden" value={category.slug} />
      <input name="description" type="hidden" value={category.description ?? ""} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <Switch
        aria-label={`Mostrar ${category.name} en el menú`}
        defaultChecked={category.showInMenu}
        label={category.showInMenu ? "En el menú" : "Oculta"}
        name="showInMenu"
        onChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

type RowProps = {
  depth: number;
  name: ReactNode;
  count?: number;
  status?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  editing?: ReactNode;
  actions?: ReactNode;
  kind: "root" | "child" | "sub" | "empty";
};

function TreeRow({ depth, name, count, status, expandable, expanded, onToggle, editing, actions, kind }: RowProps) {
  return (
    <div className={`admin-cat-row is-${kind}`} style={{ paddingLeft: 10 + depth * 26 }}>
      {expandable ? (
        <button
          aria-expanded={expanded}
          aria-label={expanded ? "Contraer" : "Expandir"}
          className="admin-cat-toggle"
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" && !expanded) { event.preventDefault(); onToggle?.(); }
            if (event.key === "ArrowLeft" && expanded) { event.preventDefault(); onToggle?.(); }
          }}
          type="button"
        >
          <ChevronRight size={16} />
        </button>
      ) : <span aria-hidden="true" className="admin-cat-toggle-spacer" />}
      <div className="admin-cat-name">{editing ?? name}</div>
      {count !== undefined ? <span className={`admin-cat-count${count === 0 ? " is-zero" : ""}`}>{count} {count === 1 ? "producto" : "productos"}</span> : null}
      {status ? <span className="admin-cat-status">{status}</span> : null}
      {actions ? <div className="admin-cat-actions">{actions}</div> : null}
    </div>
  );
}

export function CategoriesSection({
  categories,
  categoryDeletionImpactById,
  openModal,
  products,
  returnTo,
  subcategories,
}: {
  categories: Category[];
  categoryDeletionImpactById: Map<number, ReturnType<typeof getCategoryDeletionImpact>>;
  openModal: (modal: AdminModalState) => void;
  products: Product[];
  returnTo: string;
  subcategories: Subcategory[];
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const specials = useMemo(() => categories.filter((category) => isSpecialCategorySlug(category.slug)).sort(byName), [categories]);
  const roots = useMemo(() => categories.filter((category) => !category.parentCategoryId && !isSpecialCategorySlug(category.slug)).sort(byName), [categories]);
  // Huérfanas: sin categoría o con una categoría borrada. El borrado de categorías es lógico (deleted_at) y
  // getSubcategories todavía devuelve el id de la borrada, así que se comparan contra las categorías activas.
  const activeCategoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const isOrphan = (subcategory: Subcategory) => subcategory.categoryId === null || !activeCategoryIds.has(subcategory.categoryId);
  const orphans = useMemo(
    () => subcategories.filter((subcategory) => subcategory.categoryId === null || !activeCategoryIds.has(subcategory.categoryId)).sort(byName),
    [subcategories, activeCategoryIds],
  );
  const childrenOf = (id: number) => categories.filter((category) => category.parentCategoryId === id).sort(byName);
  const subsOf = (id: number) => subcategories.filter((subcategory) => subcategory.categoryId === id).sort(byName);
  const ownCount = (category: Category) => categoryDeletionImpactById.get(category.id)?.productCount ?? 0;
  const totalCount = (category: Category) => ownCount(category) + childrenOf(category.id).reduce((sum, child) => sum + ownCount(child), 0);

  const q = normalize(query.trim());
  const matches = (text: string) => !q || normalize(text).includes(q);
  const branchMatches = (root: Category) =>
    matches(root.name)
    || subsOf(root.id).some((sub) => matches(sub.name))
    || childrenOf(root.id).some((child) => matches(child.name) || subsOf(child.id).some((sub) => matches(sub.name)));
  const visibleRoots = roots.filter(branchMatches);
  const isOpen = (id: number) => Boolean(q) || expanded.has(id);
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  function menuStatus(category: Category, parent?: Category) {
    if (!parent) {
      // Una principal restaurada desde la papelera vuelve con show_in_menu apagado y sin padre: no sale en el menú.
      return category.showInMenu
        ? <span className="admin-cat-badge is-on">En el menú</span>
        : <span className="admin-cat-badge is-warn" title="Editala y marcá &quot;Categoría principal del menú&quot; para que vuelva a aparecer.">Fuera del menú · revisar</span>;
    }
    if (PET_ROOTS.includes(parent.slug)) {
      const speciesCount = products.filter((product) => product.categorySlug === category.slug && product.species === parent.slug).length;
      return speciesCount >= MENU_MIN_PRODUCTS
        ? <span className="admin-cat-badge is-on">En el menú</span>
        : <span className="admin-cat-badge is-warn" title={`El menú muestra las categorías de ${parent.name} con ${MENU_MIN_PRODUCTS} productos o más.`}>Fuera del menú · {speciesCount} de {MENU_MIN_PRODUCTS}</span>;
    }
    return <span className="admin-cat-badge">Solo en la tienda</span>;
  }

  function categoryMenu(category: Category, parent?: Category): MenuItem[] {
    const hasChildren = childrenOf(category.id).length > 0;
    return [
      { label: "Renombrar", icon: Pencil, onSelect: () => setRenaming(`c-${category.id}`) },
      ...(!parent ? [{ label: "Nueva categoría interna", icon: FolderPlus, onSelect: () => openModal({ type: "category-create", parentCategoryId: category.id }) }] : []),
      { label: "Nueva subcategoría", icon: FilePlus2, onSelect: () => openModal({ type: "subcategory-create", categoryId: category.id }) },
      { label: "Mover a…", icon: FolderInput, onSelect: () => setMoveTarget({ kind: "category", category, hasChildren }) },
      { label: "Editar descripción y slug", icon: Pencil, onSelect: () => openModal({ type: "category-edit", category }) },
      { label: "Eliminar", icon: Trash2, danger: true, onSelect: () => openModal({ type: "category-delete", category, stage: categoryDeletionImpactById.get(category.id)?.hasContents ? 1 : 2 }) },
    ];
  }

  function subcategoryMenu(subcategory: Subcategory): MenuItem[] {
    return [
      { label: "Renombrar", icon: Pencil, onSelect: () => setRenaming(`s-${subcategory.slug}`), disabled: isOrphan(subcategory), hint: isOrphan(subcategory) ? "Primero asignala a una categoría" : undefined },
      { label: isOrphan(subcategory) ? "Asignar a…" : "Mover a…", icon: FolderInput, onSelect: () => setMoveTarget({ kind: "subcategory", subcategory: isOrphan(subcategory) ? { ...subcategory, categoryId: null } : subcategory }) },
      { label: "Editar descripción", icon: Pencil, onSelect: () => openModal({ type: "subcategory-edit", subcategory }), disabled: isOrphan(subcategory) },
      { label: "Eliminar", icon: Trash2, danger: true, onSelect: () => openModal({ type: "subcategory-delete", subcategory, stage: 1 }) },
    ];
  }

  function subcategoryRows(owner: Category, depth: number) {
    const subs = subsOf(owner.id).filter((sub) => !q || matches(sub.name) || matches(owner.name));
    if (!subs.length) {
      if (q) return null;
      return (
        <TreeRow
          depth={depth}
          kind="empty"
          name={<span className="admin-cat-empty">Sin subcategorías · <button className="ui-link-button" onClick={() => openModal({ type: "subcategory-create", categoryId: owner.id })} type="button">Crear</button></span>}
        />
      );
    }
    return subs.map((sub) => (
      <TreeRow
        actions={<MenuButton items={subcategoryMenu(sub)} label={`Acciones de ${sub.name}`} />}
        count={sub.count}
        depth={depth}
        editing={renaming === `s-${sub.slug}` ? <InlineRename onCancel={() => setRenaming(null)} returnTo={returnTo} target={{ kind: "subcategory", subcategory: sub }} /> : undefined}
        key={sub.slug}
        kind="sub"
        name={<span onDoubleClick={() => setRenaming(`s-${sub.slug}`)}>{sub.name}</span>}
      />
    ));
  }

  return (
    <div id="admin-section-categorias">
      <SectionHeader
        action={<button className="button button-primary" onClick={() => openModal({ type: "category-create" })} type="button"><FolderPlus size={18} /> Nueva categoría</button>}
        subtitle="Organizá tus productos por categorías y subcategorías"
        title="Categorías"
      />
      <div className="admin-toolbar admin-cat-toolbar">
        <label className="admin-search">
          <Search size={18} />
          <input aria-label="Buscar categorías y subcategorías" className="field" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar categoría o subcategoría…" value={query} />
        </label>
        {!q && roots.length ? (
          <button className="button button-light" onClick={() => setExpanded(expanded.size ? new Set() : new Set(roots.map((root) => root.id).concat(roots.flatMap((root) => childrenOf(root.id).map((child) => child.id)))))} type="button">
            {expanded.size ? "Contraer todo" : "Expandir todo"}
          </button>
        ) : null}
      </div>

      {orphans.length ? (
        <div className="card admin-cat-alert" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>{orphans.length === 1 ? "1 subcategoría sin categoría" : `${orphans.length} subcategorías sin categoría`}</strong>
            <span>Quedaron sueltas al borrar su categoría. Asignalas para que sus productos vuelvan a filtrarse bien.</span>
            <ul>
              {orphans.map((sub) => (
                <li key={sub.slug}>
                  <span>{sub.name} <small>{sub.count} {sub.count === 1 ? "producto" : "productos"}</small></span>
                  <button className="button button-light" onClick={() => setMoveTarget({ kind: "subcategory", subcategory: { ...sub, categoryId: null } })} type="button">Asignar…</button>
                  <MenuButton items={subcategoryMenu(sub)} label={`Acciones de ${sub.name}`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="card admin-cat-tree" aria-label="Categorías" role="list">
        {!roots.length ? (
          <div className="admin-empty-state admin-cat-empty-state">
            <strong>Todavía no hay categorías</strong>
            <span>Creá la primera para empezar a ordenar los productos.</span>
            <button className="button button-primary" onClick={() => openModal({ type: "category-create" })} type="button"><FolderPlus size={16} /> Crear categoría</button>
          </div>
        ) : !visibleRoots.length ? (
          <div className="admin-empty-state admin-cat-empty-state">
            <strong>Sin resultados para “{query.trim()}”</strong>
            <button className="ui-link-button" onClick={() => setQuery("")} type="button">Limpiar búsqueda</button>
          </div>
        ) : visibleRoots.map((root) => {
          const children = childrenOf(root.id).filter((child) => !q || matches(root.name) || matches(child.name) || subsOf(child.id).some((sub) => matches(sub.name)));
          const open = isOpen(root.id);
          return (
            <div className="admin-cat-branch" key={root.id} role="listitem">
              <TreeRow
                actions={<MenuButton items={categoryMenu(root)} label={`Acciones de ${root.name}`} />}
                count={totalCount(root)}
                depth={0}
                editing={renaming === `c-${root.id}` ? <InlineRename onCancel={() => setRenaming(null)} returnTo={returnTo} target={{ kind: "category", category: root }} /> : undefined}
                expandable
                expanded={open}
                kind="root"
                name={<strong onDoubleClick={() => setRenaming(`c-${root.id}`)}>{root.name}</strong>}
                onToggle={() => toggle(root.id)}
                status={menuStatus(root)}
              />
              {open ? (
                <div className="admin-cat-children">
                  {children.map((child) => {
                    const childOpen = isOpen(child.id);
                    return (
                      <div key={child.id}>
                        <TreeRow
                          actions={<MenuButton items={categoryMenu(child, root)} label={`Acciones de ${child.name}`} />}
                          count={ownCount(child)}
                          depth={1}
                          editing={renaming === `c-${child.id}` ? <InlineRename onCancel={() => setRenaming(null)} returnTo={returnTo} target={{ kind: "category", category: child }} /> : undefined}
                          expandable
                          expanded={childOpen}
                          kind="child"
                          name={<span onDoubleClick={() => setRenaming(`c-${child.id}`)}>{child.name}</span>}
                          onToggle={() => toggle(child.id)}
                          status={menuStatus(child, root)}
                        />
                        {childOpen ? subcategoryRows(child, 2) : null}
                      </div>
                    );
                  })}
                  {subcategoryRows(root, 1)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {specials.length ? (
        <section aria-labelledby="admin-cat-pages-title" className="card admin-cat-pages">
          <header>
            <h2 id="admin-cat-pages-title">Páginas del menú</h2>
            <span>Páginas fijas que aparecen al final del menú de la tienda. Solo se muestran u ocultan y se edita su texto.</span>
          </header>
          {specials.map((page) => (
            <div className="admin-cat-row is-page" key={page.id}>
              <div className="admin-cat-name"><strong>{page.name}</strong></div>
              <SpecialPageSwitch category={page} returnTo={returnTo} />
              <button className="button button-light" onClick={() => openModal({ type: "category-edit", category: page })} type="button"><Pencil size={15} /> Editar texto</button>
            </div>
          ))}
        </section>
      ) : null}

      {moveTarget ? <MoveDialog categories={categories} onClose={() => setMoveTarget(null)} returnTo={returnTo} target={moveTarget} /> : null}
    </div>
  );
}
