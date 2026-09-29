"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Cat, Dog, MessageCircle, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { SearchIndexItem } from "@/lib/types";
import { normalizeText, prepareIndex, searchProducts, topBrands } from "@/lib/search";

const SPECIES_PARAM: Record<string, "perro" | "gato"> = {
  perro: "perro", perros: "perro", perra: "perro", perras: "perro",
  gato: "gato", gatos: "gato", gata: "gato", gatas: "gato",
};

/**
 * Arma el link de "Ver todos" para que /tienda muestre lo mismo que el panel:
 * la especie va como filtro (?pet=) y el resto como texto, con la marca bien escrita.
 */
function buildShopHref(query: string, correctedQuery: string | null, brands: string[]) {
  const words = (correctedQuery ?? query).trim().split(/\s+/).filter(Boolean);
  const pet = words.map((word) => SPECIES_PARAM[normalizeText(word)]).find(Boolean);
  let text = words.filter((word) => !SPECIES_PARAM[normalizeText(word)]).join(" ");
  const compact = normalizeText(text).replace(/ /g, "");
  const brandKeys = brands.map((name) => ({ name, key: normalizeText(name).replace(/ /g, "") }));
  // "proplan" o "royalcanin" se mandan con el nombre real de la marca, que es lo que /tienda entiende.
  const partial = compact.length >= 4 ? brandKeys.filter(({ key }) => key.includes(compact)) : [];
  const brand = brandKeys.find(({ key }) => key === compact)?.name ?? (partial.length === 1 ? partial[0].name : undefined);
  if (brand) text = brand;
  const params = new URLSearchParams();
  if (pet) params.set("pet", pet);
  if (text) params.set("q", text);
  const search = params.toString();
  return search ? `/tienda?${search}` : "/tienda";
}

export function LiveSearch({ products }: { products: SearchIndexItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listboxId = useId();
  const [query, setQuery] = useState(() => (pathname === "/tienda" ? searchParams.get("q") ?? "" : ""));
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El índice se prepara una sola vez; al tipear solo se recorre, sin volver a normalizar.
  const index = useMemo(() => prepareIndex(products), [products]);
  const brands = useMemo(() => [...new Set(products.map((product) => product.brand))], [products]);
  const suggestedBrands = useMemo(() => topBrands(products, 4), [products]);
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(() => searchProducts(index, deferredQuery, 8), [index, deferredQuery]);
  const hasQuery = Boolean(query.trim());
  const shopHref = buildShopHref(deferredQuery, result.correctedQuery, brands);
  const optionCount = result.hits.length + (hasQuery ? 1 : 0);
  const showPanel = panelOpen;

  const closePanel = () => {
    setPanelOpen(false);
    setActiveIndex(-1);
  };
  const resetSearch = () => {
    setQuery("");
    closePanel();
  };

  useEffect(() => {
    if (!showPanel) return;
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPanelOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [showPanel]);

  function go(href: string) {
    // Si va a /tienda, el texto queda en el campo para que se vea qué se está buscando.
    if (href.startsWith("/tienda")) closePanel();
    else resetSearch();
    inputRef.current?.blur();
    router.push(href);
  }

  // El campo refleja la búsqueda de /tienda (?q=) al entrar por link, recarga o atrás,
  // y se limpia al ir a otra página o a /tienda sin búsqueda.
  const urlQuery = pathname === "/tienda" ? searchParams.get("q") ?? "" : "";
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  function applySuggestion(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    setPanelOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Sin esto Chrome vacía el campo de búsqueda y el panel se vuelve a abrir.
      event.preventDefault();
      if (showPanel) closePanel();
      else setQuery("");
      return;
    }
    if (!optionCount) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setPanelOpen(true);
      setActiveIndex((current) => {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = current + step;
        if (next < -1) return optionCount - 1;
        if (next >= optionCount) return -1;
        return next;
      });
    }
  }

  const optionId = (position: number) => `${listboxId}-opcion-${position}`;
  const activeHit = activeIndex >= 0 ? result.hits[activeIndex] : undefined;

  return (
    <div
      className="live-search"
      onBlur={(event) => {
        // Salir del buscador con Tab cierra el panel.
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) closePanel();
      }}
      ref={rootRef}
    >
      <form
        action="/tienda"
        className="search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasQuery) return;
          if (activeHit) go(`/producto/${activeHit.product.slug}`);
          else go(shopHref);
        }}
      >
        <Search className="search-icon" size={20} />
        <input
          aria-activedescendant={showPanel && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showPanel}
          aria-label="Buscar productos"
          autoComplete="off"
          className="field"
          enterKeyHint="search"
          name="q"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setPanelOpen(true);
          }}
          onFocus={() => setPanelOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar alimento, marca o medicamento..."
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="search"
          value={query}
        />
        {query ? (
          <button className="search-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} type="button" aria-label="Limpiar búsqueda">
            <X size={16} />
          </button>
        ) : null}
      </form>
      {showPanel ? (
        <div className="search-panel" id={listboxId} role={hasQuery && result.hits.length ? "listbox" : undefined} aria-label="Resultados de búsqueda">
          {!hasQuery ? (
            <div className="search-suggestions">
              <span className="search-panel-label">Buscá rápido</span>
              <div className="search-chips">
                <button className="search-chip" onClick={() => go("/tienda?pet=perro")} type="button"><Dog size={15} /> Perros</button>
                <button className="search-chip" onClick={() => go("/tienda?pet=gato")} type="button"><Cat size={15} /> Gatos</button>
                {suggestedBrands.map((brand) => (
                  <button className="search-chip" key={brand} onClick={() => applySuggestion(brand)} type="button">{brand}</button>
                ))}
              </div>
            </div>
          ) : result.hits.length ? (
            <>
              <div className="search-panel-head">
                <span>
                  {result.total === 1 ? "1 producto" : `${result.total} productos`}
                  {result.correctedQuery ? <> para <b>“{result.correctedQuery}”</b></> : null}
                </span>
              </div>
              {result.hits.map(({ product }, position) => (
                <Link
                  aria-selected={position === activeIndex}
                  className={`search-result${position === activeIndex ? " active" : ""}`}
                  href={`/producto/${product.slug}`}
                  id={optionId(position)}
                  key={product.id}
                  onClick={resetSearch}
                  onMouseEnter={() => setActiveIndex(position)}
                  role="option"
                >
                  <span className="search-result-text">
                    <small className="search-result-brand">{product.brand}</small>
                    <strong>{product.name}</strong>
                    <small>{product.subcategory || product.category}</small>
                  </span>
                  <span className="search-result-side">
                    <em>{formatPrice(product.priceCents)}</em>
                    {product.totalStock > 0 ? null : <small className="search-result-out">Sin stock</small>}
                  </span>
                </Link>
              ))}
            </>
          ) : (
            <div className="search-empty">
              <strong>No encontramos productos para “{query.trim()}”</strong>
              <p>Probá con la marca, el tipo de alimento o la mascota.</p>
              <div className="search-chips">
                <button className="search-chip" onClick={() => go("/tienda?pet=perro")} type="button"><Dog size={15} /> Perros</button>
                <button className="search-chip" onClick={() => go("/tienda?pet=gato")} type="button"><Cat size={15} /> Gatos</button>
                <a className="search-chip search-chip-whatsapp" href="https://wa.me/5492234251324" rel="noreferrer" target="_blank">
                  <MessageCircle size={15} /> Consultanos por WhatsApp
                </a>
              </div>
            </div>
          )}
          {hasQuery ? (
            <Link
              aria-selected={activeIndex === result.hits.length}
              className={`search-all${activeIndex === result.hits.length ? " active" : ""}`}
              href={result.hits.length ? shopHref : "/tienda"}
              id={optionId(result.hits.length)}
              onClick={resetSearch}
              role="option"
            >
              {result.hits.length ? "Ver todos en la tienda" : "Ver toda la tienda"} <ArrowRight size={15} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
