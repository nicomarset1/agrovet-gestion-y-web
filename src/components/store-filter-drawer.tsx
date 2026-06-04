"use client";

import Link from "next/link";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FacetItem = { name: string; count: number };
type CategoryFacet = FacetItem & { slug: string; subcategories: { slug: string; name: string; count: number }[] };
type Facets = {
  categories: CategoryFacet[];
  brands: FacetItem[];
  lifeStages: FacetItem[];
  sizes: FacetItem[];
  needs: FacetItem[];
  species: FacetItem[];
  presentations: FacetItem[];
  priceRange?: { min: number; max: number };
};
type Filters = {
  q?: string;
  category?: string | string[];
  subcategory?: string | string[];
  pet?: string;
  brand?: string | string[];
  stage?: string | string[];
  size?: string | string[];
  need?: string | string[];
  presentation?: string | string[];
  minPrice?: string;
  maxPrice?: string;
  stock?: string;
  sort?: string;
};

function Section({ children, title }: { children: ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`drawer-section ${open ? "open" : ""}`}>
      <button className="drawer-section-toggle" onClick={() => setOpen((current) => !current)} type="button">
        <span>{title}</span>
        <ChevronRight size={16} />
      </button>
      <div className="drawer-section-body">{children}</div>
    </section>
  );
}

function selected(input?: string | string[]) {
  return Array.isArray(input) ? input : input ? [input] : [];
}

function ChoiceRadio({
  checked,
  label,
  name,
  value,
}: {
  checked: boolean;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className={`filter-choice ${checked ? "active" : ""}`}>
      <input defaultChecked={checked} name={name} type="radio" value={value} />
      <span>{label}</span>
    </label>
  );
}

function ChoiceCheck({
  checked,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange?: () => void;
  value: string;
}) {
  return (
    <label className={`filter-choice ${checked ? "active" : ""}`}>
      {onChange ? (
        <input checked={checked} name={name} onChange={onChange} type="checkbox" value={value} />
      ) : (
        <input defaultChecked={checked} name={name} type="checkbox" value={value} />
      )}
      <span>{label}</span>
    </label>
  );
}

function formatMoney(value: number) {
  return `$ ${new Intl.NumberFormat("es-AR").format(value)}`;
}

function parseMoney(value: string) {
  const numeric = value.replace(/[^\d]/g, "");
  return numeric ? Number(numeric) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type DragStartEvent = {
  clientX: number;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function StoreFilterDrawer({ facets, filters }: { facets: Facets; filters: Filters }) {
  const [open, setOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => selected(filters.category));
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(() => selected(filters.subcategory));
  const selectedBrands = selected(filters.brand);
  const selectedStages = selected(filters.stage);
  const selectedSizes = selected(filters.size);
  const selectedNeeds = selected(filters.need);
  const selectedPresentations = selected(filters.presentation);
  const selectedCategoryFacets = facets.categories.filter((item) => selectedCategories.includes(item.slug));
  const subcategories = selectedCategoryFacets.length ? selectedCategoryFacets.flatMap((item) => item.subcategories) : [];
  const subcategoryEnabled = selectedCategoryFacets.length > 0;
  const prices = useMemo(() => facets.priceRange ?? { min: 0, max: 0 }, [facets.priceRange]);
  const initialMinPrice = clamp(Number(filters.minPrice ?? prices.min), prices.min, prices.max);
  const initialMaxPrice = clamp(Number(filters.maxPrice ?? prices.max), initialMinPrice, prices.max);
  const [{ handleA, handleB }, setPriceHandles] = useState({ handleA: initialMinPrice, handleB: initialMaxPrice });
  const [activeHandle, setActiveHandle] = useState<"a" | "b">("b");
  const [draggingHandle, setDraggingHandle] = useState<"a" | "b" | null>(null);
  const draggingHandleRef = useRef<"a" | "b" | null>(null);
  const rangeTrackRef = useRef<HTMLDivElement | null>(null);
  const [rangeWidth, setRangeWidth] = useState(0);
  const minPrice = Math.min(handleA, handleB);
  const maxPrice = Math.max(handleA, handleB);
  const minHandle = handleA <= handleB ? "a" : "b";
  const maxHandle = handleA <= handleB ? "b" : "a";
  const rangeSpan = Math.max(1, prices.max - prices.min);
  const minPercent = ((minPrice - prices.min) / rangeSpan) * 100;
  const maxPercent = ((maxPrice - prices.min) / rangeSpan) * 100;
  const handleAPercent = ((handleA - prices.min) / rangeSpan) * 100;
  const handleBPercent = ((handleB - prices.min) / rangeSpan) * 100;
  const rangePad = 14;
  const toggleCategory = (slug: string) => {
    setSelectedCategories((current) => {
      const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
      const allowed = new Set(facets.categories.filter((item) => next.includes(item.slug)).flatMap((item) => item.subcategories.map((subcategory) => subcategory.slug)));
      setSelectedSubcategories((currentSubcategories) => currentSubcategories.filter((subcategory) => allowed.has(subcategory)));
      return next;
    });
  };

  const toggleSubcategory = (slug: string) => {
    setSelectedSubcategories((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));
  };

  const setHandle = useCallback((handle: "a" | "b", value: number) => {
    setActiveHandle(handle);
    setPriceHandles((current) => ({ ...current, [handle === "a" ? "handleA" : "handleB"]: clamp(value, prices.min, prices.max) }));
  }, [prices.max, prices.min]);

  const setDisplayedMinPrice = (value: number) => {
    setHandle(minHandle, value);
  };

  const setDisplayedMaxPrice = (value: number) => {
    setHandle(maxHandle, value);
  };

  const valueFromClientX = useCallback((clientX: number) => {
    const element = rangeTrackRef.current;
    if (!element) return prices.min;
    const rect = element.getBoundingClientRect();
    const usableWidth = Math.max(1, rect.width - (rangePad * 2));
    const x = clamp(clientX - rect.left - rangePad, 0, usableWidth);
    return Math.round(prices.min + (x / usableWidth) * rangeSpan);
  }, [prices.min, rangeSpan]);

  const startDrag = (handle: "a" | "b") => (event: DragStartEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // eslint-disable-next-line react-hooks/refs
    draggingHandleRef.current = handle;
    setActiveHandle(handle);
    setDraggingHandle(handle);
    // eslint-disable-next-line react-hooks/refs
    setHandle(handle, valueFromClientX(event.clientX));
  };

  useEffect(() => {
    const element = rangeTrackRef.current;
    if (!element) return;
    const update = () => setRangeWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const usableWidth = Math.max(1, rangeWidth - (rangePad * 2));
  const handleALeft = rangePad + (usableWidth * handleAPercent / 100);
  const handleBLeft = rangePad + (usableWidth * handleBPercent / 100);

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const currentHandle = draggingHandleRef.current;
    if (!currentHandle) return;
    setActiveHandle(currentHandle);
    setHandle(currentHandle, valueFromClientX(event.clientX));
  };

  const stopDrag = () => {
    if (!draggingHandleRef.current) return;
    setDraggingHandle(null);
    draggingHandleRef.current = null;
  };

  return (
    <>
      <button className="filter-open-button" onClick={() => setOpen(true)} type="button">
        <SlidersHorizontal size={18} />
        Filtrar
      </button>
      <div className={`filter-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`filter-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="filter-drawer-head">
          <strong>Filtros</strong>
          <button onClick={() => setOpen(false)} type="button" aria-label="Cerrar filtros"><X size={18} /></button>
        </div>
        <form action="/tienda" className="drawer-form" onSubmit={() => setOpen(false)}>
          <Section title="Producto">
            <div className="filter-search">
              <Search size={18} />
              <input className="field" defaultValue={filters.q} name="q" placeholder="Buscar producto o marca" />
            </div>
          </Section>
          <Section title="Animal">
            <div className="filter-choice-grid">
              <ChoiceRadio checked={filters.pet === "perro"} label="Perro" name="pet" value="perro" />
              <ChoiceRadio checked={filters.pet === "gato"} label="Gato" name="pet" value="gato" />
            </div>
          </Section>
          <Section title="Categoría">
            <div className="filter-choice-grid">
              {facets.categories.map((category) => (
                <ChoiceCheck
                  checked={selectedCategories.includes(category.slug)}
                  key={category.slug}
                  label={category.name}
                  name="category"
                  onChange={() => toggleCategory(category.slug)}
                  value={category.slug}
                />
              ))}
            </div>
          </Section>
          <Section title="Subcategoría">
            {subcategoryEnabled ? (
              <div className="filter-choice-grid">
                {subcategories.map((subcategory) => (
                  <ChoiceCheck
                    checked={selectedSubcategories.includes(subcategory.slug)}
                    key={subcategory.slug}
                    label={subcategory.name}
                    name="subcategory"
                    onChange={() => toggleSubcategory(subcategory.slug)}
                    value={subcategory.slug}
                  />
                ))}
              </div>
            ) : <p className="description">Elegí una categoría para ver sus subcategorías.</p>}
          </Section>
          <Section title="Precio">
            <input name="minPrice" type="hidden" value={minPrice} />
            <input name="maxPrice" type="hidden" value={maxPrice} />
            <div className="price-input-grid">
              <label>
                <span>Mínimo</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setDisplayedMinPrice(parseMoney(event.target.value))}
                  value={formatMoney(minPrice)}
                />
              </label>
              <label>
                <span>Máximo</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setDisplayedMaxPrice(parseMoney(event.target.value))}
                  value={formatMoney(maxPrice)}
                />
              </label>
            </div>
            <div
              className="dual-range"
              ref={rangeTrackRef}
              onMouseMove={moveDrag}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              style={{
                "--handle-a": `${handleAPercent}%`,
                "--handle-b": `${handleBPercent}%`,
                "--range-start": `${minPercent}%`,
                "--range-end": `${maxPercent}%`,
              } as CSSProperties}
            >
              <span aria-hidden="true" className="dual-range-track">
                <span className="dual-range-fill" />
              </span>
              <button
                aria-valuemax={prices.max}
                aria-valuemin={prices.min}
                aria-valuenow={handleA}
                aria-label="Perilla de precio A"
                className={`dual-range-thumb thumb-a ${activeHandle === "a" || draggingHandle === "a" ? "active" : ""}`}
                onMouseDown={startDrag("a")}
                onPointerDown={startDrag("a")}
                role="slider"
                style={{ left: `${handleALeft}px` }}
                type="button"
              >
                <span className="dual-range-thumb-core" />
              </button>
              <button
                aria-valuemax={prices.max}
                aria-valuemin={prices.min}
                aria-valuenow={handleB}
                aria-label="Perilla de precio B"
                className={`dual-range-thumb thumb-b ${activeHandle === "b" || draggingHandle === "b" ? "active" : ""}`}
                onMouseDown={startDrag("b")}
                onPointerDown={startDrag("b")}
                role="slider"
                style={{ left: `${handleBLeft}px` }}
                type="button"
              >
                <span className="dual-range-thumb-core" />
              </button>
            </div>
            <div className="price-range-bounds"><span>{formatMoney(prices.min)}</span><span>{formatMoney(prices.max)}</span></div>
          </Section>
          <Section title="Marca">
            <div className="filter-choice-grid">
              {facets.brands.map((brand) => <ChoiceCheck checked={selectedBrands.includes(brand.name)} key={brand.name} label={brand.name} name="brand" value={brand.name} />)}
            </div>
          </Section>
          <Section title="Edad y tamaño">
            <span className="filter-choice-title">Edad</span>
            <div className="filter-choice-grid">
              {facets.lifeStages.map((stage) => <ChoiceCheck checked={selectedStages.includes(stage.name)} key={stage.name} label={stage.name} name="stage" value={stage.name} />)}
            </div>
            <span className="filter-choice-title">Tamaño</span>
            <div className="filter-choice-grid">
              {facets.sizes.map((size) => <ChoiceCheck checked={selectedSizes.includes(size.name)} key={size.name} label={size.name} name="size" value={size.name} />)}
            </div>
          </Section>
          <Section title="Necesidad">
            <div className="filter-choice-grid">
              {facets.needs.map((need) => <ChoiceCheck checked={selectedNeeds.includes(need.name)} key={need.name} label={need.name} name="need" value={need.name} />)}
            </div>
          </Section>
          <Section title="Presentación">
            <div className="filter-choice-grid">
              {facets.presentations.map((presentation) => <ChoiceCheck checked={selectedPresentations.includes(presentation.name)} key={presentation.name} label={presentation.name} name="presentation" value={presentation.name} />)}
            </div>
          </Section>
          <Section title="Stock y orden">
            <div className="filter-choice-grid">
              <ChoiceRadio checked={!filters.sort} label="Destacados" name="sort" value="" />
              <ChoiceRadio checked={filters.sort === "price_asc"} label="Precio menor" name="sort" value="price_asc" />
              <ChoiceRadio checked={filters.sort === "price_desc"} label="Precio mayor" name="sort" value="price_desc" />
              <ChoiceRadio checked={filters.sort === "stock_desc"} label="Más stock" name="sort" value="stock_desc" />
            </div>
            <label className={`filter-choice ${filters.stock === "disponible" ? "active" : ""}`}>
              <input defaultChecked={filters.stock === "disponible"} name="stock" type="checkbox" value="disponible" />
              <span>Solo con stock</span>
            </label>
          </Section>
          <div className="drawer-actions">
            <button className="button button-primary" type="submit">Aplicar</button>
            <Link className="button button-light" href="/tienda" onClick={() => setOpen(false)}>Limpiar</Link>
          </div>
        </form>
      </aside>
    </>
  );
}

