"use client";

// Panel de gestión: sección Productos (listado, edición rápida, alta, edición, fotos y baja).

import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, PackagePlus, Pencil, Search, Trash2, X, Zap } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatPrice } from "@/lib/format";
import { productImageSrc } from "@/lib/product-image";
import { Select, type SelectOption } from "@/components/ui/select";
import { Checkbox, NumberInput, Switch } from "@/components/ui/form-controls";
import type { Category, Product } from "@/lib/types";
import { createProductAction, deleteProductAction, updateProductActiveAction, updateProductAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, UNCATEGORIZED_CATEGORY_VALUE, UNCATEGORIZED_SUBCATEGORY_SLUG, leafCategories } from "@/components/admin/shared";
import type { AdminModalState, Subcategory } from "@/components/admin/shared";
import "./productos.css";

export function ProductDeleteModal({
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
        Vas a quitar este producto del catálogo y moverlo a Papelera. Se conservan sus variantes y stock para poder restaurarlo.
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

const PHOTO_MAX_SIDE = 800;

const PHOTO_TARGET_BYTES = 400 * 1024;

type ProductPhotoResult = { dataUrl: string; originalBytes: number; finalBytes: number };

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeProductPhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Respeta la orientación EXIF de las fotos de celular.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Si el navegador no puede, se intenta con <img>, que también aplica la orientación.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

// Achica la foto antes de guardarla: lado mayor de 800 px como máximo, WebP (o JPEG si el
// navegador no lo soporta) y alrededor de 400 KB. Se guarda igual que antes, como data URL.
async function shrinkProductPhoto(file: File): Promise<ProductPhotoResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo elegido no es una imagen. Elegí una foto en JPG, PNG o WebP.");
  }
  let decoded: Awaited<ReturnType<typeof decodeProductPhoto>>;
  try {
    decoded = await decodeProductPhoto(file);
  } catch {
    throw new Error("No se pudo leer la imagen. Probá con una foto en JPG, PNG o WebP.");
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo procesar la imagen en este navegador.");
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const supportsWebp = probe.toDataURL("image/webp").startsWith("data:image/webp");
    const type = supportsWebp ? "image/webp" : "image/jpeg";
    if (!supportsWebp) {
      // JPEG no tiene transparencia: el fondo transparente queda blanco.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);
    const qualities = supportsWebp ? [0.8, 0.7, 0.6, 0.5, 0.4] : [0.82, 0.72, 0.62, 0.52, 0.42];
    let blob: Blob | null = null;
    for (const quality of qualities) {
      blob = await canvasToBlob(canvas, type, quality);
      if (!blob || blob.size <= PHOTO_TARGET_BYTES) break;
    }
    if (!blob) throw new Error("No se pudo procesar la imagen en este navegador.");
    // Si achicarla no la hizo más liviana (por ejemplo, un PNG chico), se guarda la original.
    const finalBlob = file.size <= blob.size ? file : blob;
    return { dataUrl: await readBlobAsDataUrl(finalBlob), originalBytes: file.size, finalBytes: finalBlob.size };
  } finally {
    decoded.release();
  }
}

// ===== Datos comunes =====

const BRANCHES = [
  { id: 1, short: "Ind", name: "Independencia" },
  { id: 2, short: "Bel", name: "Belgrano" },
] as const;
// Mismo umbral que las alertas de stock del resumen.
const LOW_STOCK = 5;
// Valor del selector para "la categoría en papelera" (nunca viaja al servidor).
const TRASHED_CATEGORY_VALUE = "__trashed";
const PAGE_SIZE = 50;

const SPECIES_OPTIONS: SelectOption[] = [
  { value: "perro", label: "Perro" },
  { value: "gato", label: "Gato" },
  { value: "perro-gato", label: "Perro y gato" },
];
const LIFE_STAGE_OPTIONS: SelectOption[] = [
  { value: "", label: "Sin definir" },
  { value: "cachorro", label: "Cachorro" },
  { value: "junior", label: "Junior" },
  { value: "adulto", label: "Adulto" },
  { value: "senior", label: "Senior" },
  { value: "todas las edades", label: "Todas las edades" },
];
const SIZE_OPTIONS: SelectOption[] = [
  { value: "", label: "Sin definir" },
  { value: "mini", label: "Mini" },
  { value: "pequeño", label: "Pequeño" },
  { value: "mediano", label: "Mediano" },
  { value: "grande", label: "Grande" },
  { value: "gigante", label: "Gigante" },
];

// Si el producto trae un valor que no está en la lista (por ejemplo "pequeno" importado), se agrega como
// opción para no perderlo al guardar.
function withCurrentValue(options: SelectOption[], current: string | undefined) {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: current, hint: "Valor cargado" }];
}

function branchStock(product: Product, branchId: number) {
  return product.variants.reduce((sum, variant) => sum + (variant.stocks.find((stock) => stock.branchId === branchId)?.quantity ?? 0), 0);
}

function totalStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + variant.totalStock, 0);
}

function priceBounds(product: Product) {
  const prices = product.variants.map((variant) => variant.priceCents);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };
}

function priceLabel(product: Product) {
  const { min, max } = priceBounds(product);
  return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
}

function stockLevel(quantity: number) {
  return quantity <= 0 ? "out" : quantity <= LOW_STOCK ? "low" : "ok";
}

// Opciones de categoría con la jerarquía del panel ("Perros › Alimento húmedo").
function categoryOptions(categories: Category[], valueOf: (category: Category) => string): SelectOption[] {
  return leafCategories(categories).map((category) => ({
    value: valueOf(category),
    label: category.name,
    depth: category.parentCategoryName ? 1 : 0,
    path: category.parentCategoryName ? `${category.parentCategoryName} › ${category.name}` : undefined,
  }));
}

function SubmitButton({ children, pendingText, className = "button button-primary", disabled }: { children: React.ReactNode; pendingText: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={disabled || pending} type="submit">{pending ? pendingText : children}</button>;
}

// ===== Modal de alta y edición =====

type VariantRow = { id?: number; label: string; sku: string; barcode: string; price: string; stock1: string; stock2: string };

const emptyVariantRow = (): VariantRow => ({ label: "", sku: "", barcode: "", price: "", stock1: "0", stock2: "0" });

function variantRowsOf(product?: Product): VariantRow[] {
  return product?.variants.length
    ? product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      price: String(variant.priceCents / 100),
      stock1: String(variant.stocks.find((stock) => stock.branchId === 1)?.quantity ?? 0),
      stock2: String(variant.stocks.find((stock) => stock.branchId === 2)?.quantity ?? 0),
    }))
    : [emptyVariantRow()];
}

function ModalSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="product-form-section admin-span-2">
      <header>
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </header>
      <div className="product-form-grid">{children}</div>
    </section>
  );
}

export function ProductModal({
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
  // Categoría en la papelera: mientras no se toque el selector, se manda keepCategory=1 y el servidor conserva
  // la categoría y la subcategoría guardadas (para que vuelvan solas al restaurarla).
  const trashedCategoryName = mode === "edit" ? product?.deletedCategoryName : undefined;
  const [categoryTouched, setCategoryTouched] = useState(false);
  const keepTrashedCategory = Boolean(trashedCategoryName) && !categoryTouched;
  const [brandValue, setBrandValue] = useState(product?.brand ?? "");
  const [saveBrandAsFrequent, setSaveBrandAsFrequent] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  // En edición, imageUrl arranca con la ruta /api/product-image/... solo para la vista previa: la foto
  // se manda al guardar únicamente si se cambió o se quitó (si no, el servidor conserva la guardada).
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [imageChanged, setImageChanged] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<
    | { state: "idle" }
    | { state: "processing" }
    | { state: "done"; originalBytes: number; finalBytes: number }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const photoRequest = useRef(0);
  const photoProcessing = photoStatus.state === "processing";
  const [frequentBrands, setFrequentBrands] = useState<string[]>(() => {
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
  const [variantRows, setVariantRows] = useState<VariantRow[]>(() => variantRowsOf(product));
  const selectedCategory = selectedCategoryId ? categories.find((category) => category.id === selectedCategoryId) ?? null : null;
  const availableSubcategories = useMemo(
    () => (selectedCategory ? subcategories.filter((subcategory) => subcategory.categorySlug === selectedCategory.slug) : []),
    [selectedCategory, subcategories],
  );
  const brandKnown = frequentBrands.some((item) => item.toLowerCase() === brandValue.trim().toLowerCase());
  const brandHasText = Boolean(brandValue.trim());
  const brandSuggestions = useMemo(() => {
    const query = brandValue.trim().toLowerCase();
    return frequentBrands.filter((brand) => !query || brand.toLowerCase().includes(query)).slice(0, 8);
  }, [brandValue, frequentBrands]);
  const persistFrequentBrands = (next: string[]) => {
    const normalized = [...new Set(next.map((brand) => brand.trim()).filter(Boolean))].slice(0, 20);
    setFrequentBrands(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("agrovet-frequent-brands", JSON.stringify(normalized));
    }
  };
  const resolvedSubcategorySlug = selectedCategory
    ? (availableSubcategories.some((subcategory) => subcategory.slug === selectedSubcategorySlug) ? selectedSubcategorySlug : availableSubcategories[0]?.slug ?? UNCATEGORIZED_SUBCATEGORY_SLUG)
    : UNCATEGORIZED_SUBCATEGORY_SLUG;
  const totalByRow = (row: VariantRow) => (Number(row.stock1) || 0) + (Number(row.stock2) || 0);
  const updateRow = (index: number, patch: Partial<VariantRow>) => {
    setVariantRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };
  const totalUnits = variantRows.reduce((sum, row) => sum + totalByRow(row), 0);

  return (
    <AdminModal
      className="product-modal"
      onClose={onClose}
      subtitle={mode === "create" ? "Cargá un producto con todas sus presentaciones." : `${product?.brand ?? ""} ${product?.name ?? ""}`.trim()}
      title={mode === "create" ? "Nuevo producto" : "Editar producto"}
    >
      <form action={action} className="admin-modal-form product-form" onSubmitCapture={() => {
        if (saveBrandAsFrequent && !brandKnown) {
          persistFrequentBrands([...frequentBrands, brandValue.trim()]);
        }
      }}>
        {mode === "edit" && product ? <input name="id" type="hidden" value={product.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <input name="color" type="hidden" value={product?.color ?? "#5b0f73"} />
        {keepTrashedCategory ? (
          <>
            <input name="keepCategory" type="hidden" value="1" />
            <input name="categoryId" type="hidden" value={UNCATEGORIZED_CATEGORY_VALUE} />
            <input name="subcategorySlug" type="hidden" value={product?.subcategorySlug || UNCATEGORIZED_SUBCATEGORY_SLUG} />
          </>
        ) : null}

        <ModalSection title="Datos" hint="Nombre, marca y dónde aparece en la tienda.">
          <label className="admin-field product-form-wide">
            <span>Nombre del producto</span>
            <input className="field" defaultValue={product?.name ?? ""} name="name" placeholder="Nombre del producto" required />
          </label>
          <div className="admin-field admin-brand-field">
            <span>Marca</span>
            <input
              aria-label="Marca"
              className="field"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              data-lpignore="true"
              placeholder="Marca"
              required
              spellCheck={false}
              value={brandValue}
              onBlur={() => window.setTimeout(() => setBrandMenuOpen(false), 120)}
              onChange={(event) => {
                setBrandValue(event.target.value);
                setBrandMenuOpen(true);
              }}
              onFocus={() => setBrandMenuOpen(true)}
            />
            <input name="brand" type="hidden" value={brandValue} />
            {brandMenuOpen && brandSuggestions.length ? (
              <div className="admin-brand-suggestions">
                <div className="admin-brand-suggestions-header">
                  <span>Sugerencias</span>
                  <button className="mini-button" onMouseDown={(event) => event.preventDefault()} onClick={() => persistFrequentBrands([])} type="button">Vaciar</button>
                </div>
                <div className="admin-brand-suggestions-list" role="listbox" aria-label="Marcas frecuentes">
                  {brandSuggestions.map((brand) => (
                    <div className="admin-brand-suggestion" key={brand}>
                      <button
                        className="admin-brand-suggestion-main"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setBrandValue(brand);
                          setBrandMenuOpen(false);
                        }}
                        type="button"
                      >
                        <strong>{brand}</strong>
                        <small>Marca guardada</small>
                      </button>
                      <button
                        className="admin-brand-suggestion-remove"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => persistFrequentBrands(frequentBrands.filter((item) => item !== brand))}
                        type="button"
                        aria-label={`Eliminar ${brand} de marcas frecuentes`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {brandKnown ? (
              <span className="admin-fixed-badge">Ya está en frecuentes</span>
            ) : (
              <Checkbox
                checked={saveBrandAsFrequent}
                disabled={!brandHasText}
                label="Guardar como marca frecuente"
                onChange={(event) => setSaveBrandAsFrequent(event.target.checked)}
              />
            )}
          </div>
          <div className="admin-field">
            <span id="product-category-label">Categoría</span>
            <Select
              ariaLabelledBy="product-category-label"
              name={keepTrashedCategory ? undefined : "categoryId"}
              onChange={(next) => {
                if (next === TRASHED_CATEGORY_VALUE) {
                  setCategoryTouched(false);
                  return;
                }
                setCategoryTouched(true);
                if (next === UNCATEGORIZED_CATEGORY_VALUE) {
                  setSelectedCategoryId(null);
                  setSelectedSubcategorySlug(UNCATEGORIZED_SUBCATEGORY_SLUG);
                  return;
                }
                const nextCategoryId = Number(next);
                setSelectedCategoryId(nextCategoryId);
                const nextCategory = selectableCategories.find((category) => category.id === nextCategoryId);
                const nextSubcategories = nextCategory ? subcategories.filter((subcategory) => subcategory.categorySlug === nextCategory.slug) : [];
                setSelectedSubcategorySlug(nextSubcategories[0]?.slug ?? UNCATEGORIZED_SUBCATEGORY_SLUG);
              }}
              options={[
                ...(trashedCategoryName ? [{ value: TRASHED_CATEGORY_VALUE, label: `${trashedCategoryName} (en papelera)`, hint: "Se conserva si no la cambiás" }] : []),
                { value: UNCATEGORIZED_CATEGORY_VALUE, label: "Sin categoría" },
                ...categoryOptions(categories, (category) => String(category.id)),
              ]}
              value={keepTrashedCategory ? TRASHED_CATEGORY_VALUE : selectedCategoryId ? String(selectedCategoryId) : UNCATEGORIZED_CATEGORY_VALUE}
            />
            {keepTrashedCategory ? (
              <small className="product-trashed-note">La categoría «{trashedCategoryName}» está en la papelera. Si no la cambiás, se conserva para cuando la restaures.</small>
            ) : null}
          </div>
          <div className="admin-field">
            <span id="product-subcategory-label">Subcategoría</span>
            {keepTrashedCategory ? (
              <Select
                ariaLabelledBy="product-subcategory-label"
                disabled
                options={[{ value: "kept", label: product?.subcategorySlug && product.subcategorySlug !== UNCATEGORIZED_SUBCATEGORY_SLUG ? product.subcategory : "Sin subcategoría" }]}
                value="kept"
              />
            ) : (
              <Select
                ariaLabelledBy="product-subcategory-label"
                name="subcategorySlug"
                onChange={setSelectedSubcategorySlug}
                options={[
                  { value: UNCATEGORIZED_SUBCATEGORY_SLUG, label: "Sin subcategoría" },
                  ...availableSubcategories.map((subcategory) => ({ value: subcategory.slug, label: subcategory.name })),
                ]}
                value={resolvedSubcategorySlug}
              />
            )}
          </div>
          <div className="admin-field">
            <span id="product-species-label">Especie</span>
            <Select ariaLabelledBy="product-species-label" defaultValue={product?.species ?? "perro"} name="species" options={SPECIES_OPTIONS} searchable={false} />
          </div>
          <div className="admin-field">
            <span id="product-stage-label">Edad</span>
            <Select ariaLabelledBy="product-stage-label" defaultValue={product?.lifeStage ?? ""} name="lifeStage" options={withCurrentValue(LIFE_STAGE_OPTIONS, product?.lifeStage)} searchable={false} />
          </div>
          <div className="admin-field">
            <span id="product-size-label">Tamaño</span>
            <Select ariaLabelledBy="product-size-label" defaultValue={product?.size ?? ""} name="size" options={withCurrentValue(SIZE_OPTIONS, product?.size)} searchable={false} />
          </div>
          <label className="admin-field">
            <span>Necesidad</span>
            <input className="field" defaultValue={product?.need ?? ""} name="need" placeholder="Piel sensible" />
          </label>
          <label className="admin-field product-form-wide">
            <span>Descripción</span>
            <textarea className="field" defaultValue={product?.description ?? ""} minLength={8} name="description" placeholder="Descripción del producto (al menos 8 caracteres)" required />
          </label>
        </ModalSection>

        <ModalSection
          title="Presentaciones y stock"
          hint={`${variantRows.length} ${variantRows.length === 1 ? "presentación" : "presentaciones"} · ${totalUnits} unidades en total. Una presentación guardada no se borra: para dejar de venderla, poné su stock en 0.`}
        >
          <div className="product-variant-list product-form-wide">
            {variantRows.map((variant, index) => (
              <div className="product-variant-card" key={`${variant.id ?? "new"}-${index}`}>
                <div className="product-variant-head">
                  <strong>{variant.label || `Presentación ${index + 1}`}</strong>
                  <span>{totalByRow(variant)} u.</span>
                  {/* El guardado no borra presentaciones ya guardadas (conservan su historial de ventas):
                      solo se pueden quitar las nuevas que todavía no se guardaron. */}
                  {!variant.id && variantRows.length > 1 ? (
                    <button
                      aria-label={`Quitar presentación nueva ${index + 1}`}
                      className="icon-button danger"
                      onClick={() => setVariantRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
                <input name="variantId" type="hidden" value={variant.id ?? ""} />
                <div className="product-variant-fields">
                  <label className="admin-field">
                    <span>Presentación</span>
                    <input className="field" name="variantLabel" onChange={(event) => updateRow(index, { label: event.target.value })} placeholder="1 kg" required value={variant.label} />
                  </label>
                  <label className="admin-field">
                    <span>SKU</span>
                    <input className="field" minLength={3} name="variantSku" onChange={(event) => updateRow(index, { sku: event.target.value })} placeholder="SKU" required value={variant.sku} />
                  </label>
                  <label className="admin-field">
                    <span>Código de barras</span>
                    <input className="field" name="variantBarcode" onChange={(event) => updateRow(index, { barcode: event.target.value })} placeholder="Escaneá o escribí el número" value={variant.barcode} />
                  </label>
                  <label className="admin-field">
                    <span>Precio</span>
                    <input className="field" inputMode="decimal" min="1" name="variantPrice" onChange={(event) => updateRow(index, { price: event.target.value })} required step="0.01" type="number" value={variant.price} />
                  </label>
                  {BRANCHES.map((branch) => {
                    const key = branch.id === 1 ? "stock1" : "stock2";
                    return (
                      <div className="admin-field" key={branch.id}>
                        <span>Stock {branch.name}</span>
                        <NumberInput
                          ariaLabel={`Stock ${branch.name} de ${variant.label || `presentación ${index + 1}`}`}
                          max={99999}
                          min={0}
                          name={branch.id === 1 ? "variantStock1" : "variantStock2"}
                          onChange={(next) => updateRow(index, { [key]: next === "" ? "" : String(next) })}
                          required
                          value={variant[key] === "" ? "" : Number(variant[key])}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <button className="button button-light product-variant-add" type="button" onClick={() => setVariantRows((rows) => [...rows, emptyVariantRow()])}>
              <PackagePlus size={16} /> Agregar presentación
            </button>
          </div>
        </ModalSection>

        <ModalSection title="Foto" hint="Se achica sola antes de guardarse. Si no la cambiás, se conserva la actual.">
          <label className="admin-field product-form-wide">
            <span>Foto del producto</span>
            <input
              accept="image/*"
              className="field"
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                const request = ++photoRequest.current;
                if (!file) {
                  setImageUrl(product?.imageUrl ?? "");
                  setImageChanged(false);
                  setPhotoStatus({ state: "idle" });
                  return;
                }
                setPhotoStatus({ state: "processing" });
                try {
                  const result = await shrinkProductPhoto(file);
                  if (request !== photoRequest.current) return;
                  setImageUrl(result.dataUrl);
                  setImageChanged(true);
                  setPhotoStatus({ state: "done", originalBytes: result.originalBytes, finalBytes: result.finalBytes });
                } catch (error) {
                  if (request !== photoRequest.current) return;
                  input.value = "";
                  setPhotoStatus({ state: "error", message: error instanceof Error ? error.message : "No se pudo procesar la imagen." });
                }
              }}
              type="file"
            />
            {photoStatus.state === "processing" ? (
              <p className="notice loading-notice" role="status"><span aria-hidden="true" className="loader-dot" /> Procesando foto…</p>
            ) : null}
            {photoStatus.state === "error" ? <p className="notice error" role="alert">{photoStatus.message}</p> : null}
            {photoStatus.state === "done" ? (
              <small className="description">
                {photoStatus.finalBytes < photoStatus.originalBytes
                  ? `Foto optimizada: ${formatFileSize(photoStatus.originalBytes)} → ${formatFileSize(photoStatus.finalBytes)}.`
                  : `Foto lista: ${formatFileSize(photoStatus.finalBytes)}.`}
              </small>
            ) : null}
          </label>
          {mode === "create" || imageChanged ? <input name="imageUrl" type="hidden" value={imageUrl} /> : null}
          <div className="admin-image-preview product-form-wide">
            {imageUrl ? (
              <div className="admin-image-preview-frame">
                <Image
                  alt="Vista previa del producto"
                  className="admin-image-preview-image"
                  fill
                  sizes="(max-width: 640px) 100vw, 360px"
                  src={imageUrl}
                  unoptimized
                />
              </div>
            ) : (
              <div className="admin-image-preview-empty">Subí una imagen para verla aquí</div>
            )}
            {imageUrl ? (
              <button className="button button-light" onClick={() => { setImageUrl(""); setImageChanged(true); setPhotoStatus({ state: "idle" }); }} type="button">Quitar imagen</button>
            ) : null}
          </div>
        </ModalSection>

        <ModalSection title="Visibilidad">
          <div className="product-form-checks product-form-wide">
            <Switch defaultChecked={product?.active ?? true} label="Activo en la tienda" name="active" />
            <Checkbox defaultChecked={Boolean(product?.featured)} label="Destacado" hint="Aparece primero en la tienda y en la home." name="featured" />
            <Checkbox defaultChecked={Boolean(product?.requiresAdvice)} label="Requiere asesoramiento" hint="Muestra el aviso de producto veterinario en la ficha." name="requiresAdvice" />
          </div>
        </ModalSection>

        <div className="admin-modal-actions admin-span-2 product-form-actions">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <SubmitButton disabled={photoProcessing} pendingText="Guardando…">
            {photoProcessing ? "Procesando foto…" : mode === "create" ? "Crear producto" : "Guardar cambios"}
          </SubmitButton>
        </div>
      </form>
    </AdminModal>
  );
}

// ===== Edición rápida de precio y stock =====

// La edición rápida manda el producto completo a updateProductAction (la misma que el modal) cambiando solo
// precios y stock. Si algún dato no pasaría la validación del guardado, se pide usar el editor completo.
function quickEditProblems(product: Product, categoryId: string) {
  const problems: string[] = [];
  if (product.name.trim().length < 2) problems.push("nombre");
  if (product.brand.trim().length < 2) problems.push("marca");
  if (product.description.trim().length < 8) problems.push("descripción (mínimo 8 caracteres)");
  if (!/^#[0-9a-fA-F]{6}$/.test(product.color)) problems.push("color");
  if (!product.variants.length) problems.push("presentaciones");
  if (product.variants.some((variant) => variant.sku.trim().length < 3)) problems.push("SKU de alguna presentación (mínimo 3 caracteres)");
  if (product.variants.some((variant) => !variant.label.trim())) problems.push("nombre de alguna presentación");
  if (!categoryId) problems.push("categoría");
  return problems;
}

function QuickEdit({
  categories,
  onCancel,
  onFullEdit,
  product,
  returnTo,
}: {
  categories: Category[];
  onCancel: () => void;
  onFullEdit: () => void;
  product: Product;
  returnTo: string;
}) {
  const [rows, setRows] = useState<VariantRow[]>(() => variantRowsOf(product));
  const category = categories.find((item) => item.slug === product.categorySlug);
  const categoryId = product.categorySlug ? (category ? String(category.id) : "") : UNCATEGORIZED_CATEGORY_VALUE;
  const problems = quickEditProblems(product, categoryId);
  const updateRow = (index: number, patch: Partial<VariantRow>) => setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));

  if (problems.length) {
    return (
      <div className="product-quick product-quick-blocked" role="status">
        <p>Para editar precio o stock desde acá, primero completá en el editor: {problems.join(", ")}.</p>
        <div className="product-quick-actions">
          <button className="button button-light" onClick={onCancel} type="button">Cerrar</button>
          <button className="button button-primary" onClick={onFullEdit} type="button"><Pencil size={15} /> Abrir editor</button>
        </div>
      </div>
    );
  }

  return (
    <form action={updateProductAction} className="product-quick" aria-label={`Edición rápida de ${product.name}`}>
      <input name="id" type="hidden" value={product.id} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="name" type="hidden" value={product.name} />
      <input name="brand" type="hidden" value={product.brand} />
      <input name="categoryId" type="hidden" value={categoryId} />
      {product.deletedCategoryName ? <input name="keepCategory" type="hidden" value="1" /> : null}
      <input name="subcategorySlug" type="hidden" value={product.subcategorySlug || UNCATEGORIZED_SUBCATEGORY_SLUG} />
      <input name="species" type="hidden" value={product.species} />
      <input name="lifeStage" type="hidden" value={product.lifeStage} />
      <input name="size" type="hidden" value={product.size} />
      <input name="need" type="hidden" value={product.need} />
      <input name="description" type="hidden" value={product.description} />
      <input name="color" type="hidden" value={product.color} />
      {product.active ? <input name="active" type="hidden" value="on" /> : null}
      {product.featured ? <input name="featured" type="hidden" value="on" /> : null}
      {product.requiresAdvice ? <input name="requiresAdvice" type="hidden" value="on" /> : null}
      <div className="product-quick-grid" role="table" aria-label="Precio y stock por presentación">
        <div className="product-quick-row product-quick-head" role="row">
          <span role="columnheader">Presentación</span>
          <span role="columnheader">Precio</span>
          {BRANCHES.map((branch) => <span key={branch.id} role="columnheader">Stock {branch.name}</span>)}
        </div>
        {rows.map((row, index) => (
          <div className="product-quick-row" key={row.id ?? index} role="row">
            <input name="variantId" type="hidden" value={row.id ?? ""} />
            <input name="variantLabel" type="hidden" value={row.label} />
            <input name="variantSku" type="hidden" value={row.sku} />
            <input name="variantBarcode" type="hidden" value={row.barcode} />
            <strong role="cell">{row.label}</strong>
            <span role="cell">
              <input
                aria-label={`Precio de ${row.label}`}
                className="field product-quick-price"
                inputMode="decimal"
                min="1"
                name="variantPrice"
                onChange={(event) => updateRow(index, { price: event.target.value })}
                required
                step="0.01"
                type="number"
                value={row.price}
              />
            </span>
            {BRANCHES.map((branch) => {
              const key = branch.id === 1 ? "stock1" : "stock2";
              return (
                <span key={branch.id} role="cell">
                  <NumberInput
                    ariaLabel={`Stock ${branch.name} de ${row.label}`}
                    className={stockLevel(Number(row[key]) || 0) !== "ok" ? `is-${stockLevel(Number(row[key]) || 0)}` : ""}
                    max={99999}
                    min={0}
                    name={branch.id === 1 ? "variantStock1" : "variantStock2"}
                    onChange={(next) => updateRow(index, { [key]: next === "" ? "" : String(next) })}
                    required
                    value={row[key] === "" ? "" : Number(row[key])}
                  />
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="product-quick-actions">
        <button className="button button-light" onClick={onFullEdit} type="button"><Pencil size={15} /> Editor completo</button>
        <button className="button button-light" onClick={onCancel} type="button">Cancelar</button>
        <SubmitButton pendingText="Guardando…">Guardar precio y stock</SubmitButton>
      </div>
    </form>
  );
}

// ===== Listado =====

type SortKey = "name" | "category" | "price" | "stock" | "active";
type StockFilter = "all" | "out" | "low" | "in";

// Firma de precios y stock: si cambia (porque se guardó), la edición rápida abierta se cierra sola.
const productSignature = (product: Product) => product.variants
  .map((variant) => `${variant.id}:${variant.priceCents}:${variant.stocks.map((stock) => stock.quantity).join("/")}`)
  .join("|");

function SortHeader({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (key: SortKey) => void; className?: string }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={className} scope="col">
      <button className={`products-sort ${active ? "active" : ""}`} onClick={() => onSort(sortKey)} type="button">
        {label}
        <Icon aria-hidden="true" size={13} />
      </button>
    </th>
  );
}

export function ProductsSection({
  categories,
  openModal,
  productReturnTo,
  products,
  subcategories,
}: {
  categories: Category[];
  openModal: (modal: AdminModalState) => void;
  productReturnTo: string;
  products: Product[];
  subcategories: Subcategory[];
}) {
  const [productQuery, setProductQuery] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [quickEdit, setQuickEdit] = useState<{ id: number; signature: string } | null>(null);

  const parentOf = useMemo(() => new Map(categories.map((category) => [category.slug, category.parentCategorySlug])), [categories]);
  const availableProductSubcategories = useMemo(() => {
    if (!productCategoryFilter || productCategoryFilter === UNCATEGORIZED_CATEGORY_VALUE) return [];
    // Con una categoría principal se ofrecen las subcategorías de todas sus internas.
    const slugs = new Set([productCategoryFilter, ...categories.filter((category) => category.parentCategorySlug === productCategoryFilter).map((category) => category.slug)]);
    return subcategories.filter((subcategory) => subcategory.categorySlug && slugs.has(subcategory.categorySlug));
  }, [categories, productCategoryFilter, subcategories]);

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const matchesQuery = !query || `${product.brand} ${product.name} ${product.category} ${product.subcategory} ${product.variants.map((variant) => `${variant.label} ${variant.sku} ${variant.barcode}`).join(" ")}`.toLowerCase().includes(query);
      const matchesCategory = !productCategoryFilter
        || (productCategoryFilter === UNCATEGORIZED_CATEGORY_VALUE
          ? !product.categorySlug
          : product.categorySlug === productCategoryFilter || parentOf.get(product.categorySlug) === productCategoryFilter);
      const matchesSubcategory = !productSubcategoryFilter
        || (productSubcategoryFilter === UNCATEGORIZED_SUBCATEGORY_SLUG ? product.subcategorySlug === UNCATEGORIZED_SUBCATEGORY_SLUG : product.subcategorySlug === productSubcategoryFilter);
      const matchesStatus = productStatusFilter === "all" || (productStatusFilter === "active" ? product.active : !product.active);
      const total = totalStock(product);
      const matchesStock = stockFilter === "all"
        || (stockFilter === "out" ? total <= 0 : stockFilter === "low" ? total > 0 && total <= LOW_STOCK : total > 0);
      return matchesQuery && matchesCategory && matchesSubcategory && matchesStatus && matchesStock;
    });
    const byName = (a: Product, b: Product) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, "es");
    if (!sort) return filtered.sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));
    const value = (product: Product): number | string => {
      if (sort.key === "name") return `${product.name} ${product.brand}`.toLowerCase();
      if (sort.key === "category") return `${product.category} ${product.subcategory}`.toLowerCase();
      if (sort.key === "price") return priceBounds(product).min;
      if (sort.key === "stock") return totalStock(product);
      return Number(product.active);
    };
    return filtered.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "es");
      return sort.dir * compared || byName(a, b);
    });
  }, [parentOf, productCategoryFilter, productQuery, productStatusFilter, productSubcategoryFilter, products, sort, stockFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProducts = visibleProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const productFiltersActive = Boolean(productQuery.trim() || productCategoryFilter || productSubcategoryFilter || productStatusFilter !== "all" || stockFilter !== "all");
  const productCountSummary = productFiltersActive
    ? `${visibleProducts.length} de ${products.length} productos registrados`
    : `${products.length} productos registrados`;
  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => {
    setSort((current) => (current?.key !== key ? { key, dir: key === "stock" || key === "active" ? -1 : 1 } : current.dir === 1 ? { key, dir: -1 } : null));
    resetPage();
  };
  const clearFilters = () => {
    setProductQuery("");
    setProductCategoryFilter("");
    setProductSubcategoryFilter("");
    setProductStatusFilter("all");
    setStockFilter("all");
    resetPage();
  };

  return (
    <div id="admin-section-productos">
      <SectionHeader
        action={<button className="button button-primary" onClick={() => openModal({ type: "product-create" })} type="button"><PackagePlus size={18} /> Nuevo producto</button>}
        subtitle={`Gestioná el inventario de tu veterinaria. ${productCountSummary}.`}
        title="Productos"
      />
      <div className="products-toolbar">
        <label className="admin-search products-search">
          <Search size={18} />
          <input
            aria-label="Buscar productos"
            className="field"
            onChange={(event) => { setProductQuery(event.target.value); resetPage(); }}
            placeholder="Buscar por nombre, marca, categoría, SKU o código"
            value={productQuery}
          />
        </label>
        <Select
          ariaLabel="Categoría"
          className="products-filter"
          onChange={(next) => {
            setProductCategoryFilter(next);
            setProductSubcategoryFilter("");
            resetPage();
          }}
          options={[
            { value: "", label: "Todas las categorías" },
            { value: UNCATEGORIZED_CATEGORY_VALUE, label: "Sin categoría" },
            ...categoryOptions(categories, (category) => category.slug),
          ]}
          value={productCategoryFilter}
        />
        <Select
          ariaLabel="Subcategoría"
          className="products-filter"
          disabled={!productCategoryFilter}
          onChange={(next) => { setProductSubcategoryFilter(next); resetPage(); }}
          options={[
            { value: "", label: productCategoryFilter ? "Todas las subcategorías" : "Subcategoría: elegí una categoría" },
            ...(productCategoryFilter ? [{ value: UNCATEGORIZED_SUBCATEGORY_SLUG, label: "Sin subcategoría" }] : []),
            ...availableProductSubcategories.map((subcategory) => ({ value: subcategory.slug, label: subcategory.name, hint: subcategory.categoryName ?? undefined })),
          ]}
          value={productSubcategoryFilter}
        />
        <Select
          ariaLabel="Stock"
          className="products-filter"
          onChange={(next) => { setStockFilter(next as StockFilter); resetPage(); }}
          options={[
            { value: "all", label: "Todo el stock" },
            { value: "out", label: "Sin stock" },
            { value: "low", label: `Stock bajo (hasta ${LOW_STOCK})` },
            { value: "in", label: "Con stock" },
          ]}
          searchable={false}
          value={stockFilter}
        />
        <Select
          ariaLabel="Estado en la tienda"
          className="products-filter"
          onChange={(next) => { setProductStatusFilter(next as "all" | "active" | "inactive"); resetPage(); }}
          options={[
            { value: "all", label: "Todos los estados" },
            { value: "active", label: "Activos en tienda" },
            { value: "inactive", label: "Desactivados" },
          ]}
          searchable={false}
          value={productStatusFilter}
        />
        {productFiltersActive ? <button className="button button-light products-clear" onClick={clearFilters} type="button">Limpiar filtros</button> : null}
      </div>

      <div className="card products-table-card">
        <div className="products-table-scroll">
          <table className="products-table">
            <thead>
              <tr>
                <SortHeader label="Producto" onSort={toggleSort} sort={sort} sortKey="name" />
                <SortHeader className="products-col-category" label="Categoría" onSort={toggleSort} sort={sort} sortKey="category" />
                <SortHeader className="products-col-price" label="Precio" onSort={toggleSort} sort={sort} sortKey="price" />
                <SortHeader className="products-col-stock" label="Stock" onSort={toggleSort} sort={sort} sortKey="stock" />
                <SortHeader className="products-col-active" label="En tienda" onSort={toggleSort} sort={sort} sortKey="active" />
                <th className="products-col-actions" scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {pageProducts.length ? pageProducts.map((product) => {
                const imageSrc = productImageSrc(product);
                const perBranch = BRANCHES.map((branch) => ({ ...branch, quantity: branchStock(product, branch.id) }));
                const total = totalStock(product);
                const signature = productSignature(product);
                const editing = quickEdit?.id === product.id && quickEdit.signature === signature;
                const presentation = product.variants.length === 1 ? product.variants[0].label : `${product.variants.length} presentaciones`;
                return [
                  <tr className={`products-row ${product.active ? "" : "is-inactive"} ${editing ? "is-editing" : ""}`} key={product.id}>
                    <td>
                      <div className="products-name">
                        {imageSrc ? (
                          <Image alt="" className="products-thumb" height={40} loading="lazy" src={imageSrc} unoptimized width={40} />
                        ) : (
                          <span aria-hidden="true" className="products-thumb is-empty" style={{ background: product.color }} />
                        )}
                        <div>
                          <strong title={`${product.brand} ${product.name}`}>{product.name}</strong>
                          <small title={product.variants.map((variant) => variant.label).join(", ")}>{product.brand} · {presentation}</small>
                        </div>
                      </div>
                    </td>
                    <td className="products-col-category">
                      {product.deletedCategoryName ? (
                        <span className="products-category is-trashed" title="La categoría está en la papelera: se conserva para cuando la restaures.">
                          Categoría en papelera: {product.deletedCategoryName}
                        </span>
                      ) : (
                        <span className="products-category" title={`${product.category} › ${product.subcategory}`}>
                          {product.category || "Sin categoría"}
                          {product.subcategory ? <><span aria-hidden="true"> › </span><span className="products-sub">{product.subcategory}</span></> : null}
                        </span>
                      )}
                    </td>
                    <td className="products-col-price"><strong>{priceLabel(product)}</strong></td>
                    <td className="products-col-stock">
                      <span
                        className={`products-stock is-${stockLevel(total)}`}
                        title={`${total} unidades: ${perBranch.map((branch) => `${branch.quantity} en ${branch.name}`).join(" y ")}`}
                      >
                        {perBranch.map((branch, index) => (
                          <span className={`is-${stockLevel(branch.quantity)}`} key={branch.id}>
                            {index > 0 ? <span aria-hidden="true" className="products-stock-sep">·</span> : null}
                            {branch.quantity} {branch.short}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="products-col-active">
                      <form action={updateProductActiveAction}>
                        <input name="id" type="hidden" value={product.id} />
                        <input name="returnTo" type="hidden" value={productReturnTo} />
                        <Switch
                          aria-label={product.active ? `Desactivar ${product.name} de la tienda` : `Activar ${product.name} en la tienda`}
                          defaultChecked={product.active}
                          label={<span className="sr-only">En tienda</span>}
                          name="active"
                          onChange={(event) => event.currentTarget.form?.requestSubmit()}
                        />
                      </form>
                    </td>
                    <td className="products-col-actions">
                      <div className="products-actions">
                        <button
                          aria-expanded={editing}
                          aria-label={`Editar precio y stock de ${product.name}`}
                          className={`icon-button ${editing ? "active" : ""}`}
                          onClick={() => setQuickEdit(editing ? null : { id: product.id, signature })}
                          title="Precio y stock"
                          type="button"
                        >
                          <Zap size={16} />
                        </button>
                        <button aria-label={`Editar ${product.name}`} className="icon-button" onClick={() => openModal({ type: "product-edit", product })} title="Editar" type="button"><Pencil size={16} /></button>
                        <button aria-label={`Eliminar ${product.name}`} className="icon-button danger" onClick={() => openModal({ type: "product-delete", product })} title="Eliminar" type="button"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>,
                  editing ? (
                    <tr className="products-quick-row" key={`${product.id}-quick`}>
                      <td colSpan={6}>
                        <QuickEdit
                          categories={categories}
                          onCancel={() => setQuickEdit(null)}
                          onFullEdit={() => { setQuickEdit(null); openModal({ type: "product-edit", product }); }}
                          product={product}
                          returnTo={productReturnTo}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              }) : (
                <tr>
                  <td className="products-empty" colSpan={6}>
                    No hay productos con estos filtros.
                    {productFiltersActive ? <button className="button button-light" onClick={clearFilters} type="button">Limpiar filtros</button> : null}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="products-pager">
          <span>
            {visibleProducts.length
              ? `Mostrando ${pageStart + 1}–${pageStart + pageProducts.length} de ${visibleProducts.length}`
              : "Sin resultados"}
          </span>
          {pageCount > 1 ? (
            <nav aria-label="Páginas de productos" className="products-pages">
              <button aria-label="Página anterior" className="icon-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button"><ChevronLeft size={16} /></button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <button
                  aria-current={number === currentPage ? "page" : undefined}
                  className={`products-page ${number === currentPage ? "active" : ""}`}
                  key={number}
                  onClick={() => setPage(number)}
                  type="button"
                >
                  {number}
                </button>
              ))}
              <button aria-label="Página siguiente" className="icon-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button"><ChevronRight size={16} /></button>
            </nav>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
