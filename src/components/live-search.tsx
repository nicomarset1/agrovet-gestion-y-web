"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { formatPrice } from "@/lib/format";
import type { SearchIndexItem } from "@/lib/types";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function LiveSearch({ products }: { products: SearchIndexItem[] }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const normalizedQuery = normalize(query.trim());
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return products
      .filter((product) => normalize(`${product.name} ${product.brand} ${product.category} ${product.subcategory} ${product.species}`).includes(normalizedQuery))
      .slice(0, 8);
  }, [normalizedQuery, products]);
  const closeSearch = () => setQuery("");

  return (
    <div className="live-search">
      <form action="/tienda" className="search">
        <Search className="search-icon" size={20} />
        <input
          autoComplete="off"
          className="field"
          name="q"
          onChange={(event) => startTransition(() => setQuery(event.target.value))}
          placeholder="Buscar alimento, marca o medicamento..."
          value={query}
          aria-label="Buscar productos"
        />
        {query ? (
          <button className="search-clear" onClick={() => setQuery("")} type="button" aria-label="Limpiar búsqueda">
            <X size={16} />
          </button>
        ) : null}
      </form>
      {query ? (
        <div className="search-panel">
          <div className="search-panel-head">
            <span>{results.length ? "Coincidencias" : "Sin resultados exactos"}</span>
            {isPending ? <i className="loader-dot" aria-label="Cargando búsqueda" /> : null}
          </div>
          {results.length ? results.map((product) => (
            <Link className="search-result" href={`/producto/${product.slug}`} key={product.id} onClick={closeSearch}>
              <span>
                <strong>{product.brand} {product.name}</strong>
                <small>{product.category} / {product.subcategory}</small>
              </span>
              <em>{formatPrice(product.priceCents)}</em>
            </Link>
          )) : (
            <Link className="search-result" href={`/tienda?q=${encodeURIComponent(query)}`} onClick={closeSearch}>
              <span>
                <strong>Buscar &quot;{query}&quot; en todo el catálogo</strong>
                <small>Incluye marcas, categorías y descripciones</small>
              </span>
            </Link>
          )}
          <Link className="search-all" href={`/tienda?q=${encodeURIComponent(query)}`} onClick={closeSearch}>Ver todos los resultados</Link>
        </div>
      ) : null}
    </div>
  );
}
