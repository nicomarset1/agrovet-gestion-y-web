"use client";

// Selector de presentación: aparece cuando un código de barras coincide con más de una. Sin él, el lector
// se quedaba con la primera y descontaba stock del sabor equivocado.

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { AdminModal } from "@/components/admin/shared";

export type VariantPickerOption = {
  id: number;
  brand: string;
  name: string;
  label: string;
  priceCents: number;
  stock: number;
  available: boolean;
  // Para cuando hay stock pero no se puede elegir, por ejemplo si ya está todo en la venta.
  stockNote?: string;
};

// Algunos lectores mandan un segundo Enter (CR y LF): sin esta espera, ese mismo código elegiría la primera opción.
const OPEN_GUARD_MS = 200;
// Un lector tipea muy rápido: un Enter pegado a otros caracteres es otro código, no una elección.
const SCANNER_GAP_MS = 300;

export function VariantPicker({
  code,
  onCancel,
  onPick,
  options,
}: {
  code: string;
  onCancel: () => void;
  onPick: (id: number) => void;
  options: VariantPickerOption[];
}) {
  const [activeId, setActiveId] = useState<number | null>(() => options.find((option) => option.available)?.id ?? null);
  const [scanBlocked, setScanBlocked] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const openedAt = useRef(0);
  const lastCharAt = useRef(0);
  const anyAvailable = options.some((option) => option.available);

  useEffect(() => {
    openedAt.current = performance.now();
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // En window y en captura: las teclas valen aunque el foco haya quedado en otro lado, y no llegan a los atajos de la Caja.
  useEffect(() => {
    const move = (direction: 1 | -1) => {
      const enabled = options.filter((option) => option.available);
      if (!enabled.length) return;
      const index = enabled.findIndex((option) => option.id === activeId);
      setActiveId(enabled[(index + direction + enabled.length) % enabled.length].id);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        // Con el foco en la cruz de cerrar, Enter es cerrar.
        if ((event.target as HTMLElement | null)?.closest?.("button")) return;
        event.preventDefault();
        event.stopPropagation();
        const now = performance.now();
        if (event.repeat || now - openedAt.current < OPEN_GUARD_MS) return;
        if (now - lastCharAt.current < SCANNER_GAP_MS) {
          setScanBlocked(true);
          return;
        }
        const active = options.find((option) => option.id === activeId);
        if (active?.available) onPick(active.id);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        lastCharAt.current = performance.now();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeId, onCancel, onPick, options]);

  return (
    <AdminModal
      className="admin-variant-picker"
      onClose={onCancel}
      subtitle={`El código ${code} coincide con ${options.length} presentaciones.`}
      title="Elegí la presentación"
      zIndex={200}
    >
      <ul
        aria-activedescendant={activeId !== null ? `variant-option-${activeId}` : undefined}
        aria-label="Presentaciones con este código"
        className="admin-variant-list"
        ref={listRef}
        role="listbox"
        tabIndex={0}
      >
        {options.map((option) => (
          <li
            aria-disabled={!option.available}
            aria-selected={option.id === activeId}
            className={`admin-variant-option${option.id === activeId ? " is-active" : ""}${option.available ? "" : " is-disabled"}`}
            id={`variant-option-${option.id}`}
            key={option.id}
            onClick={() => { if (option.available) onPick(option.id); }}
            onMouseMove={() => { if (option.available) setActiveId(option.id); }}
            role="option"
          >
            <span className="admin-variant-copy">
              <strong>{option.brand} {option.name}</strong>
              <small>{option.label}</small>
            </span>
            <strong className="admin-variant-price">{formatPrice(option.priceCents)}</strong>
            <span className={`admin-stock-pill${option.stock > 0 ? "" : " danger"}`}>{option.stockNote ?? (option.stock > 0 ? `Stock ${option.stock}` : "Sin stock")}</span>
          </li>
        ))}
      </ul>
      <div className="admin-variant-foot">
        <div className={`admin-pos-reveal${scanBlocked ? " is-open" : ""}`}>
          <div>
            <p className="admin-variant-alert" role={scanBlocked ? "alert" : undefined}>Primero elegí una de estas. El otro código no se cargó: volvé a escanearlo después.</p>
          </div>
        </div>
        <p className="admin-pos-keys">
          {anyAvailable
            ? <><kbd>↑</kbd> <kbd>↓</kbd> cambian · <kbd>Enter</kbd> agrega · <kbd>Esc</kbd> cancela</>
            : <>Ninguna tiene stock. <kbd>Esc</kbd> cierra</>}
        </p>
      </div>
    </AdminModal>
  );
}
