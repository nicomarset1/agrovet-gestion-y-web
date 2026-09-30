"use client";

// Panel de gestión: sección Categorías (categorías, categorías internas y subcategorías).

import { ChevronRight, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { isSpecialCategorySlug } from "@/lib/special-categories";
import type { Category, Product } from "@/lib/types";
import { createCategoryAction, createSubcategoryAction, deleteCategoryAction, deleteSubcategoryAction, updateCategoryAction, updateSubcategoryAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, leafCategories } from "@/components/admin/shared";
import type { AdminModalState, Subcategory } from "@/components/admin/shared";

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

export function CategoriesSection({
  categories,
  categoryDeletionImpactById,
  openModal,
  returnTo,
  subcategories,
}: {
  categories: Category[];
  categoryDeletionImpactById: Map<number, ReturnType<typeof getCategoryDeletionImpact>>;
  openModal: (modal: AdminModalState) => void;
  returnTo: string;
  subcategories: Subcategory[];
}) {
  const rootAdminCategories = categories.filter((category) => !category.parentCategoryId);
  const orphanSubcategories = subcategories.filter((subcategory) => subcategory.categoryId === null);
  return (
    <>
    <div id="admin-section-categorias">
    <SectionHeader action={<button className="button button-primary" onClick={() => openModal({ type: "category-create" })} type="button"><PackagePlus size={18} /> Nueva categoría</button>} subtitle="Organiza tus productos por categorías" title="Categorías" />
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
                  <button aria-label={`Editar ${subcategory.name}`} className="icon-button" onClick={() => openModal({ type: "subcategory-edit", subcategory })} type="button"><Pencil size={15} /></button>
                  <button aria-label={`Eliminar ${subcategory.name}`} className="icon-button danger" onClick={() => openModal({ type: "subcategory-delete", subcategory, stage: 1 })} type="button"><Trash2 size={15} /></button>
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
                <button aria-haspopup="dialog" aria-label={`Nueva subcategoría en ${category.name}`} className="admin-chevron" onClick={() => openModal({ type: "subcategory-create", categoryId: category.id })} type="button">
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
                  <button className="button button-light" onClick={() => openModal({ type: "category-create", parentCategoryId: category.id })} type="button"><PackagePlus size={16} /> Nueva categoría interna</button>
                  <button className="button button-light" onClick={() => openModal({ type: "subcategory-create", categoryId: category.id })} type="button"><PackagePlus size={16} /> Nueva subcategoría</button>
                </>
              ) : null}
              {isFixedSpecialCategory ? <SpecialCategoryVisibilityToggle category={category} returnTo={returnTo} /> : null}
              <button className="button button-light" onClick={() => openModal({ type: "category-edit", category })} type="button"><Pencil size={16} /> Editar</button>
              {!isFixedSpecialCategory ? (
                <button className="button button-light danger" onClick={() => openModal({ type: "category-delete", category, stage: categoryDeletionImpactById.get(category.id)?.hasContents ? 1 : 2 })} type="button"><Trash2 size={16} /> Eliminar</button>
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
                      <button aria-haspopup="dialog" aria-label={`Nueva subcategoría en ${item.name}`} className="icon-button" onClick={() => openModal({ type: "subcategory-create", categoryId: item.id })} type="button"><PackagePlus size={15} /></button>
                      <button aria-label={`Editar ${item.name}`} className="icon-button" onClick={() => openModal({ type: "category-edit", category: item })} type="button"><Pencil size={15} /></button>
                      <button aria-label={`Eliminar ${item.name}`} className="icon-button danger" onClick={() => openModal({ type: "category-delete", category: item, stage: categoryDeletionImpactById.get(item.id)?.hasContents ? 1 : 2 })} type="button"><Trash2 size={15} /></button>
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
                    <button aria-label={`Editar ${subcategory.name}`} className="icon-button" onClick={() => openModal({ type: "subcategory-edit", subcategory })} type="button"><Pencil size={15} /></button>
                    <button aria-label={`Eliminar ${subcategory.name}`} className="icon-button danger" onClick={() => openModal({ type: "subcategory-delete", subcategory, stage: 1 })} type="button"><Trash2 size={15} /></button>
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
  );
}
