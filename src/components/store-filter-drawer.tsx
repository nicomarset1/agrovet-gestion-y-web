"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countSelectedGroups, groupSeparator, type FacetGroup } from "./catalog-labels";

// Solo lo que el panel muestra: así viaja menos información al navegador.
// Los contadores son contextuales (calculados con los demás filtros activos); las opciones en 0 no llegan,
// salvo las que el cliente ya eligió, que se muestran para poder sacarlas.
type FacetItem = { name: string; count: number };
export type DrawerFacets = {
  categories: (FacetItem & { slug: string })[];
  species: FacetItem[];
  brands: FacetGroup[];
  lifeStages: FacetGroup[];
  sizes: FacetGroup[];
  needs: FacetGroup[];
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

function Section({ active = false, children, title }: { active?: boolean; children: ReactNode; title: string }) {
  const [open, setOpen] = useState(active);
  return (
    <section className={`drawer-section ${open ? "open" : ""}`}>
      <button aria-expanded={open} className="drawer-section-toggle" onClick={() => setOpen((current) => !current)} type="button">
        <span>{title}{active && <span aria-label="con filtros activos" className="drawer-section-dot" />}</span>
        <ChevronRight size={16} />
      </button>
      <div className="drawer-section-body" inert={!open}>{children}</div>
    </section>
  );
}

function selected(input?: string | string[]) {
  return Array.isArray(input) ? input : input ? [input] : [];
}

function ChoiceCount({ count }: { count?: number }) {
  if (count === undefined) return null;
  return <small aria-label={`${count} ${count === 1 ? "producto" : "productos"}`} className="filter-choice-count">{count}</small>;
}

function ChoiceRadio({
  checked,
  count,
  label,
  name,
  value,
}: {
  checked: boolean;
  count?: number;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className={`filter-choice ${checked ? "active" : ""}`}>
      <input defaultChecked={checked} name={name} type="radio" value={value} />
      <span>{label}</span>
      <ChoiceCount count={count} />
    </label>
  );
}

function ChoiceCheck({
  checked,
  count,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  count?: number;
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
      <ChoiceCount count={count} />
    </label>
  );
}

function GroupCheck({ group, name, selectedValues }: { group: FacetGroup; name: string; selectedValues: string[] }) {
  return (
    <ChoiceCheck
      checked={group.values.some((value) => selectedValues.includes(value))}
      count={group.count}
      label={group.label}
      name={name}
      value={group.values.join(groupSeparator)}
    />
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

export function StoreFilterDrawer({ facets, filters }: { facets: DrawerFacets; filters: Filters }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // "Perro" incluye los productos para perro y gato (mismo criterio que el filtro).
  const speciesCount = (name: string) => facets.species.find((item) => item.name === name)?.count ?? 0;
  const petCounts = { perro: speciesCount("perro") + speciesCount("perro-gato"), gato: speciesCount("gato") + speciesCount("perro-gato") };
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  // Cerrar devuelve el foco al botón "Filtrar" (Escape, la X o tocar afuera).
  const closeDrawer = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => selected(filters.category));
  const selectedBrands = selected(filters.brand);
  const selectedStages = selected(filters.stage);
  const selectedSizes = selected(filters.size);
  const selectedNeeds = selected(filters.need);
  const selectedPresentations = selected(filters.presentation);
  const prices = useMemo(() => facets.priceRange ?? { min: 0, max: 0 }, [facets.priceRange]);
  const initialMinPrice = clamp(Number(filters.minPrice ?? prices.min), prices.min, prices.max);
  const initialMaxPrice = clamp(Number(filters.maxPrice ?? prices.max), initialMinPrice, prices.max);
  const [{ handleA, handleB }, setPriceHandles] = useState({ handleA: initialMinPrice, handleB: initialMaxPrice });
  const [activeHandle, setActiveHandle] = useState<"a" | "b">("b");
  const [draggingHandle, setDraggingHandle] = useState<"a" | "b" | null>(null);
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
  const priceActive = Boolean(filters.minPrice && Number(filters.minPrice) > prices.min) || Boolean(filters.maxPrice && Number(filters.maxPrice) < prices.max);
  const activeCount = [
    filters.q?.trim(),
    filters.pet,
    filters.stock,
    priceActive,
  ].filter(Boolean).length
    + selected(filters.category).length
    + selected(filters.subcategory).length
    + countSelectedGroups(facets.brands, selectedBrands)
    + countSelectedGroups(facets.lifeStages, selectedStages)
    + countSelectedGroups(facets.sizes, selectedSizes)
    + countSelectedGroups(facets.needs, selectedNeeds)
    + selectedPresentations.length;
  const toggleCategory = (slug: string) => {
    setSelectedCategories((current) => (
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    ));
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

  const moveHandle = useCallback((handle: "a" | "b", clientX: number) => {
    setActiveHandle(handle);
    setHandle(handle, valueFromClientX(clientX));
  }, [setHandle, valueFromClientX]);

  const beginDrag = (handle: "a" | "b") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingHandle(handle);
    moveHandle(handle, event.clientX);
  };

  const dragThumb = (handle: "a" | "b") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingHandle !== handle) return;
    moveHandle(handle, event.clientX);
  };

  const endDrag = (handle: "a" | "b") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingHandle !== handle) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingHandle(null);
  };

  const adjustWithKeyboard = (handle: "a" | "b") => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1000 : 250;
    const keyMap: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -step * 4,
      PageUp: step * 4,
      Home: prices.min - (handle === "a" ? handleA : handleB),
      End: prices.max - (handle === "a" ? handleA : handleB),
    };
    const delta = keyMap[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    setActiveHandle(handle);
    setHandle(handle, (handle === "a" ? handleA : handleB) + delta);
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDrawer, open]);

  // Arma la URL solo con lo elegido: sin campos vacíos ni el rango de precio completo.
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      const text = String(value).trim();
      if (!text) continue;
      if (key === "minPrice" && Number(text) <= prices.min) continue;
      if (key === "maxPrice" && Number(text) >= prices.max) continue;
      // Una opción agrupada ("Pequeño") manda todos sus valores reales.
      for (const part of text.split(groupSeparator)) params.append(key, part);
    }
    setOpen(false);
    const query = params.toString();
    router.push(query ? `/tienda?${query}` : "/tienda");
  };

  // Al abrir, el foco entra al panel (se espera a que deje de estar oculto para poder enfocarlo).
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>(".drawer-section-toggle, input, button")?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  // El panel es modal: Tab y Shift+Tab quedan dentro mientras está abierto.
  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), [tabindex='0']")]
      // Fuera: lo que está dentro de una sección cerrada (inert).
      .filter((element) => !element.closest("[inert]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const usableWidth = Math.max(1, rangeWidth - (rangePad * 2));
  const handleALeft = rangePad + (usableWidth * handleAPercent / 100);
  const handleBLeft = rangePad + (usableWidth * handleBPercent / 100);

  return (
    <>
      <button aria-expanded={open} aria-haspopup="dialog" className="filter-open-button" onClick={() => setOpen(true)} ref={triggerRef} type="button">
        <SlidersHorizontal size={18} />
        Filtrar
        {activeCount > 0 && <span aria-label={`${activeCount} filtros activos`} className="filter-count">{activeCount}</span>}
      </button>
      <div aria-hidden="true" className={`filter-overlay ${open ? "open" : ""}`} onClick={closeDrawer} />
      <div
        aria-hidden={!open}
        aria-label="Filtros"
        aria-modal={open ? true : undefined}
        className={`filter-drawer ${open ? "open" : ""}`}
        inert={!open}
        onKeyDown={trapFocus}
        ref={drawerRef}
        role={open ? "dialog" : undefined}
      >
        <div className="filter-drawer-head">
          <strong>Filtros{activeCount > 0 && <span className="filter-count">{activeCount}</span>}</strong>
          <button onClick={closeDrawer} type="button" aria-label="Cerrar filtros"><X size={18} /></button>
        </div>
        <form action="/tienda" className="drawer-form" onSubmit={applyFilters}>
          {/* Lo que no se elige en el panel se conserva al aplicar. */}
          {selected(filters.subcategory).map((value) => <input key={value} name="subcategory" type="hidden" value={value} />)}
          {filters.sort && <input name="sort" type="hidden" value={filters.sort} />}
          <Section active={Boolean(filters.q?.trim())} title="Producto">
            <div className="filter-search">
              <Search size={18} />
              <input className="field" defaultValue={filters.q} name="q" placeholder="Buscar producto o marca" />
            </div>
          </Section>
          <Section active={Boolean(filters.pet)} title="Animal">
            <div className="filter-choice-grid">
              <ChoiceRadio checked={!filters.pet} label="Todos" name="pet" value="" />
              {(petCounts.perro > 0 || filters.pet === "perro") && <ChoiceRadio checked={filters.pet === "perro"} count={petCounts.perro} label="Perro" name="pet" value="perro" />}
              {(petCounts.gato > 0 || filters.pet === "gato") && <ChoiceRadio checked={filters.pet === "gato"} count={petCounts.gato} label="Gato" name="pet" value="gato" />}
            </div>
          </Section>
          <Section active={selected(filters.category).length > 0} title="Categoría">
            <div className="filter-choice-grid">
              {facets.categories.map((category) => (
                <ChoiceCheck
                  checked={selectedCategories.includes(category.slug)}
                  count={category.count}
                  key={category.slug}
                  label={category.name}
                  name="category"
                  onChange={() => toggleCategory(category.slug)}
                  value={category.slug}
                />
              ))}
            </div>
          </Section>
          <Section active={selectedBrands.length > 0} title="Marca">
            <div className="filter-choice-grid">
              {facets.brands.map((group) => <GroupCheck group={group} key={group.label} name="brand" selectedValues={selectedBrands} />)}
            </div>
          </Section>
          <Section active={priceActive} title="Precio">
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
              <div
                aria-valuemax={prices.max}
                aria-valuemin={prices.min}
                aria-valuenow={handleA}
                aria-label="Perilla de precio A"
                className={`dual-range-thumb thumb-a ${activeHandle === "a" || draggingHandle === "a" ? "active" : ""}`}
                onKeyDown={adjustWithKeyboard("a")}
                onPointerDown={beginDrag("a")}
                onPointerMove={dragThumb("a")}
                onPointerUp={endDrag("a")}
                onPointerCancel={endDrag("a")}
                role="slider"
                style={{ left: `${handleALeft}px` }}
                tabIndex={0}
              >
                <span className="dual-range-thumb-core" />
              </div>
              <div
                aria-valuemax={prices.max}
                aria-valuemin={prices.min}
                aria-valuenow={handleB}
                aria-label="Perilla de precio B"
                className={`dual-range-thumb thumb-b ${activeHandle === "b" || draggingHandle === "b" ? "active" : ""}`}
                onKeyDown={adjustWithKeyboard("b")}
                onPointerDown={beginDrag("b")}
                onPointerMove={dragThumb("b")}
                onPointerUp={endDrag("b")}
                onPointerCancel={endDrag("b")}
                role="slider"
                style={{ left: `${handleBLeft}px` }}
                tabIndex={0}
              >
                <span className="dual-range-thumb-core" />
              </div>
            </div>
          </Section>
          <Section active={selectedStages.length + selectedSizes.length > 0} title="Edad y tamaño">
            <span className="filter-choice-title">Edad</span>
            <div className="filter-choice-grid">
              {facets.lifeStages.map((group) => <GroupCheck group={group} key={group.label} name="stage" selectedValues={selectedStages} />)}
            </div>
            <span className="filter-choice-title">Tamaño</span>
            <div className="filter-choice-grid">
              {facets.sizes.map((group) => <GroupCheck group={group} key={group.label} name="size" selectedValues={selectedSizes} />)}
            </div>
          </Section>
          <Section active={selectedNeeds.length > 0} title="Necesidad">
            <div className="filter-choice-grid">
              {facets.needs.map((group) => <GroupCheck group={group} key={group.label} name="need" selectedValues={selectedNeeds} />)}
            </div>
          </Section>
          <Section active={selectedPresentations.length > 0} title="Presentación">
            <div className="filter-choice-grid">
              {facets.presentations.map((presentation) => <ChoiceCheck checked={selectedPresentations.includes(presentation.name)} count={presentation.count} key={presentation.name} label={presentation.name} name="presentation" value={presentation.name} />)}
            </div>
          </Section>
          <Section active={Boolean(filters.stock)} title="Stock">
            <label className={`filter-choice ${filters.stock === "disponible" ? "active" : ""}`}>
              <input defaultChecked={filters.stock === "disponible"} name="stock" type="checkbox" value="disponible" />
              <span>Solo con stock</span>
            </label>
          </Section>
          <div className="drawer-actions">
            <button className="button button-primary" type="submit">Aplicar</button>
            <Link className="button button-light" href={filters.sort ? `/tienda?sort=${encodeURIComponent(filters.sort)}` : "/tienda"} onClick={() => setOpen(false)}>Limpiar</Link>
          </div>
        </form>
      </div>
    </>
  );
}

