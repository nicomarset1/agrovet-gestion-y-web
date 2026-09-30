"use client";

// Panel de gestión: sección Productos (listado, alta, edición, fotos y baja).

import Image from "next/image";
import { PackagePlus, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { Select } from "@/components/ui/select";
import type { Category, Product } from "@/lib/types";
import { createProductAction, deleteProductAction, updateProductActiveAction, updateProductAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, UNCATEGORIZED_CATEGORY_VALUE, UNCATEGORIZED_SUBCATEGORY_SLUG, leafCategories } from "@/components/admin/shared";
import type { AdminModalState, Subcategory } from "@/components/admin/shared";

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
  const brandHasText = Boolean(brandValue.trim());
  const brandSuggestions = useMemo(() => {
    const query = brandValue.trim().toLowerCase();
    const matches = frequentBrands
      .filter((brand) => !query || brand.toLowerCase().includes(query))
      .slice(0, 8);
    return matches;
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
  const totalByRow = (row: { stock1: string; stock2: string }) => (Number(row.stock1) || 0) + (Number(row.stock2) || 0);
  return (
    <AdminModal
      onClose={onClose}
      subtitle={mode === "create" ? "Cargá un producto con todas sus presentaciones." : "Ajustá ficha, subcategoría, marca y variantes."}
      title={mode === "create" ? "Nuevo Producto" : "Editar Producto"}
    >
      <form action={action} className="admin-modal-form" onSubmitCapture={() => {
        if (saveBrandAsFrequent && !brandKnown) {
          persistFrequentBrands([...frequentBrands, brandValue.trim()]);
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
        <div className="admin-field admin-brand-field">
          <span>Marca</span>
          <input
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
        </div>
        <div className="admin-brand-helper admin-span-2">
          {brandKnown ? (
            <span className="admin-fixed-badge">Ya está en frecuentes</span>
          ) : (
            <label className={`admin-check ${!brandHasText ? "is-disabled" : ""}`}>
              <input
                checked={saveBrandAsFrequent}
                disabled={!brandHasText}
                onChange={(event) => setSaveBrandAsFrequent(event.target.checked)}
                type="checkbox"
              />
              <span>Guardar como marca frecuente</span>
            </label>
          )}
        </div>
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
        <input name="color" type="hidden" value={product?.color ?? "#5b0f73"} />
        <label className="admin-field admin-span-2">
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
          {mode === "create" || imageChanged ? <input name="imageUrl" type="hidden" value={imageUrl} /> : null}
          <div className="admin-image-preview">
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
        </label>
        <label className="admin-check">
          <input defaultChecked={product?.active ?? true} name="active" type="checkbox" />
          <span>Activo en tienda</span>
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
          <button className="button button-primary" disabled={photoProcessing} type="submit">{photoProcessing ? "Procesando foto…" : mode === "create" ? "Crear producto" : "Guardar cambios"}</button>
        </div>
      </form>
    </AdminModal>
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
  const selectableProductCategories = useMemo(() => leafCategories(categories), [categories]);
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
      const matchesStatus = productStatusFilter === "all" || (productStatusFilter === "active" ? product.active : !product.active);
      return matchesQuery && matchesCategory && matchesSubcategory && matchesStatus;
    }).sort((a, b) => Number(b.active) - Number(a.active) || `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`));
  }, [productCategoryFilter, productQuery, productStatusFilter, productSubcategoryFilter, products]);
  const productFiltersActive = Boolean(productQuery.trim() || productCategoryFilter || productSubcategoryFilter || productStatusFilter !== "all");
  const productCountSummary = productFiltersActive
    ? `${visibleProducts.length} de ${products.length} productos registrados`
    : `${products.length} productos registrados`;
  return (
    <>
    <div id="admin-section-productos">
    <SectionHeader
      action={<button className="button button-primary" onClick={() => openModal({ type: "product-create" })} type="button"><PackagePlus size={18} /> Nuevo producto</button>}
      subtitle={`Gestioná el inventario de tu veterinaria. ${productCountSummary}.`}
      title="Productos"
    />
    <div className="admin-toolbar">
      <label className="admin-search">
        <Search size={18} />
        <input className="field" onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar productos por nombre o categoría..." value={productQuery} />
      </label>
      <Select
        ariaLabel="Categoría"
        onChange={(next) => {
          setProductCategoryFilter(next);
          setProductSubcategoryFilter("");
        }}
        options={[
          { value: "", label: "Todas las categorías" },
          { value: UNCATEGORIZED_CATEGORY_VALUE, label: "Sin categoría" },
          ...selectableProductCategories.map((category) => ({
            value: category.slug,
            label: category.name,
            path: category.parentCategoryName ? `${category.parentCategoryName} / ${category.name}` : undefined,
            depth: category.parentCategoryName ? 1 : 0,
          })),
        ]}
        value={productCategoryFilter}
      />
      <Select
        ariaLabel="Subcategoría"
        disabled={!productCategoryFilter}
        onChange={setProductSubcategoryFilter}
        options={[
          { value: "", label: productCategoryFilter ? "Todas las subcategorías" : "Subcategoría: elegí una categoría" },
          ...(productCategoryFilter ? [{ value: UNCATEGORIZED_SUBCATEGORY_SLUG, label: "Sin subcategoría" }] : []),
          ...availableProductSubcategories.map((subcategory) => ({ value: subcategory.slug, label: subcategory.name })),
        ]}
        value={productSubcategoryFilter}
      />
      <Select
        ariaLabel="Estado en la tienda"
        onChange={(next) => setProductStatusFilter(next as "all" | "active" | "inactive")}
        options={[
          { value: "all", label: "Todos los estados" },
          { value: "active", label: "Activos en tienda" },
          { value: "inactive", label: "Desactivados" },
        ]}
        value={productStatusFilter}
      />
    </div>
    <div className="card admin-panel admin-table-wrap">
      <div className="admin-table-head">
        <span>Producto</span><span>Categoría</span><span>Precio</span><span>Stock</span><span>Tienda y acciones</span>
      </div>
      <div className="admin-product-list">
        {visibleProducts.map((product) => {
          const mainVariant = product.variants[0];
          const stockIndependencia = mainVariant?.stocks.find((stock) => stock.branchId === 1)?.quantity ?? 0;
          const stockBelgrano = mainVariant?.stocks.find((stock) => stock.branchId === 2)?.quantity ?? 0;
          return (
            <div className="admin-table-row" key={product.id}>
              <div className="admin-product-cell">
                {product.imageUrl ? (
                  <Image alt="" className="admin-product-thumb" height={40} loading="lazy" src={product.imageUrl} unoptimized width={40} />
                ) : (
                  <span aria-hidden="true" className="admin-product-thumb is-empty" style={{ background: product.color }} />
                )}
                <div className="admin-product-copy">
                  <strong title={`${product.brand} ${product.name}`}>{product.name}</strong>
                  <small>
                    {product.brand}
                    {product.variants.length ? ` · ${product.variants.map((variant) => variant.label).join(", ")}` : ""}
                    {!product.active ? <span className="admin-status-badge muted">Desactivado</span> : null}
                  </small>
                </div>
              </div>
              <span className="admin-product-category">
                {product.category}
                {product.subcategory ? <><span aria-hidden="true"> › </span><span className="admin-product-sub">{product.subcategory}</span></> : null}
              </span>
              <strong className="admin-product-price">{formatPrice(mainVariant?.priceCents ?? 0)}</strong>
              <span
                className={`admin-stock-pill admin-stock-compact ${!product.active ? "muted" : mainVariant && mainVariant.totalStock <= 3 ? "danger" : ""}`}
                title={`${mainVariant?.totalStock ?? 0} unidades: ${stockIndependencia} en Independencia y ${stockBelgrano} en Belgrano`}
              >
                {stockIndependencia} Ind · {stockBelgrano} Bel
              </span>
              <div className="admin-row-actions">
                <form action={updateProductActiveAction}>
                  <input name="id" type="hidden" value={product.id} />
                  <input name="returnTo" type="hidden" value={productReturnTo} />
                  <label className="admin-toggle" title={product.active ? "Desactivar de la tienda" : "Activar en la tienda"}>
                    <input
                      aria-label={product.active ? "Desactivar de la tienda" : "Activar en la tienda"}
                      defaultChecked={product.active}
                      name="active"
                      onChange={(event) => event.currentTarget.form?.requestSubmit()}
                      type="checkbox"
                    />
                    <span />
                  </label>
                </form>
                <button aria-label="Editar producto" className="icon-button" onClick={() => openModal({ type: "product-edit", product })} type="button"><Pencil size={16} /></button>
                <button className="icon-button danger" onClick={() => openModal({ type: "product-delete", product })} type="button" aria-label="Eliminar producto"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
    </>
  );
}
