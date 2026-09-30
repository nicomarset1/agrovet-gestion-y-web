"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalTargetFor, usePopoverPosition } from "./use-popover-position";

export type SelectOption = {
  value: string;
  label: string;
  /** Nivel de sangría: 0 para "Perros", 1 para "Alimento húmedo" debajo de "Perros". */
  depth?: number;
  /** Texto completo para el botón y la búsqueda, por ejemplo "Perros › Alimento húmedo". */
  path?: string;
  /** Texto chico a la derecha (una cantidad, un código). */
  hint?: string;
  disabled?: boolean;
};

/** Encabezado no seleccionable que agrupa las opciones que le siguen. */
export type SelectGroupHeading = { heading: string };
export type SelectItem = SelectOption | SelectGroupHeading;

const isHeading = (item: SelectItem): item is SelectGroupHeading => "heading" in item;

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Reemplazo del <select> nativo: la lista abierta del navegador no se puede estilizar
 * (en Windows se ve la de sistema). Lista propia con portal y posición inteligente.
 *
 * - Jerarquía: opciones con depth (sangría) y path ("Perros › Alimento húmedo"), o encabezados.
 * - Búsqueda interna automática con más de 8 opciones (sin tildes ni mayúsculas).
 * - Teclado: flechas, Inicio, Fin, RePág/AvPág, Enter, Escape y Tab; type-ahead sin buscador.
 * - Formularios: con `name` agrega un input oculto, así las server actions reciben el valor igual
 *   que con el <select>. Controlado (value + onChange) o no controlado (defaultValue).
 */
export function Select({
  id,
  name,
  value: controlledValue,
  defaultValue = "",
  onChange,
  options,
  placeholder = "Elegir…",
  ariaLabel,
  ariaLabelledBy,
  disabled,
  required,
  invalid,
  searchable,
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: SelectItem[];
  placeholder?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const listId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlledValue ?? uncontrolled;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const position = usePopoverPosition(open, portalTarget, triggerRef, panelRef, 220);

  const selectable = useMemo(() => options.filter((item): item is SelectOption => !isHeading(item)), [options]);
  const withSearch = searchable ?? selectable.length > 8;
  const selected = selectable.find((option) => option.value === value);

  // Lista visible: con búsqueda, las opciones que coinciden (mostradas con su ruta completa) y sin encabezados.
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return selectable.filter((option) => normalize(`${option.path ?? ""} ${option.label}`).includes(q));
  }, [options, selectable, query]);
  const visibleOptions = visible.filter((item): item is SelectOption => !isHeading(item));
  const enabledIndexes = visibleOptions.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    if (controlledValue === undefined) setUncontrolled(option.value);
    onChange?.(option.value);
    close();
  }

  function close(returnFocus = true) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function openList() {
    if (disabled) return;
    const selectedIndex = selectable.findIndex((option) => option.value === value);
    setActive(selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1);
    setPortalTarget(portalTargetFor(triggerRef.current));
    setOpen(true);
  }

  // Al abrir: foco en el buscador o en la lista, y la opción activa a la vista.
  useEffect(() => {
    if (!open || !portalTarget) return;
    const frame = requestAnimationFrame(() => (withSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, portalTarget, withSearch]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function move(step: number | "first" | "last") {
    if (!enabledIndexes.length) return;
    if (step === "first") return setActive(enabledIndexes[0]);
    if (step === "last") return setActive(enabledIndexes[enabledIndexes.length - 1]);
    const position = enabledIndexes.indexOf(active);
    const next = position < 0 ? (step > 0 ? 0 : enabledIndexes.length - 1) : Math.max(0, Math.min(enabledIndexes.length - 1, position + step));
    setActive(enabledIndexes[next]);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); return;
      case "ArrowUp": event.preventDefault(); move(-1); return;
      case "PageDown": event.preventDefault(); move(8); return;
      case "PageUp": event.preventDefault(); move(-8); return;
      case "Home": if (!withSearch || !query) { event.preventDefault(); move("first"); } return;
      case "End": if (!withSearch || !query) { event.preventDefault(); move("last"); } return;
      case "Enter": {
        event.preventDefault();
        const option = visibleOptions[active];
        if (option) choose(option);
        return;
      }
      case "Escape": event.preventDefault(); close(); return;
      case "Tab": setOpen(false); setQuery(""); return;
    }
    // Type-ahead en la lista sin buscador: salta a la opción que empieza con lo tipeado.
    if (!withSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typeahead.current.text = now - typeahead.current.time > 600 ? event.key : typeahead.current.text + event.key;
      typeahead.current.time = now;
      const text = normalize(typeahead.current.text);
      const match = visibleOptions.findIndex((option) => !option.disabled && normalize(option.label).startsWith(text));
      if (match >= 0) setActive(match);
    }
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  const optionId = (index: number) => `${listId}-opt-${index}`;
  const triggerText = selected ? selected.path ?? selected.label : "";
  let optionIndex = -1;

  return (
    <>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        className={`ui-trigger ui-select-trigger${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        id={id}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={triggerText ? "ui-trigger-value" : "ui-trigger-placeholder"}>{triggerText || placeholder}</span>
        <ChevronDown aria-hidden="true" className="ui-trigger-chevron" size={17} />
      </button>
      {name ? <input name={name} required={required} type="hidden" value={value} /> : null}
      {open && portalTarget
        ? createPortal(
          <div
            className={`ui-popover ui-select-popover is-${position.placement}`}
            ref={panelRef}
            style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          >
            {withSearch ? (
              <label className="ui-select-search">
                <Search aria-hidden="true" size={16} />
                <input
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  aria-autocomplete="list"
                  aria-controls={listId}
                  aria-expanded="true"
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                  onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                  onKeyDown={onListKeyDown}
                  placeholder={searchPlaceholder}
                  ref={searchRef}
                  role="combobox"
                  spellCheck={false}
                  type="text"
                  value={query}
                />
              </label>
            ) : null}
            <div
              aria-activedescendant={!withSearch && active >= 0 ? optionId(active) : undefined}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
              className="ui-select-list"
              id={listId}
              onKeyDown={withSearch ? undefined : onListKeyDown}
              ref={listRef}
              role="listbox"
              tabIndex={withSearch ? -1 : 0}
            >
              {visibleOptions.length === 0 ? <p className="ui-select-empty">{emptyText}</p> : null}
              {visible.map((item, itemIndex) => {
                if (isHeading(item)) {
                  return <div aria-hidden="true" className="ui-select-heading" key={`h-${itemIndex}-${item.heading}`}>{item.heading}</div>;
                }
                optionIndex += 1;
                const index = optionIndex;
                const isSelected = item.value === value;
                const depth = query ? 0 : item.depth ?? 0;
                return (
                  <div
                    aria-disabled={item.disabled || undefined}
                    aria-selected={isSelected}
                    className={`ui-option${index === active ? " is-active" : ""}${isSelected ? " is-selected" : ""}${depth ? " is-child" : ""}`}
                    data-index={index}
                    id={optionId(index)}
                    key={item.value}
                    onClick={() => choose(item)}
                    onMouseMove={() => { if (!item.disabled && index !== active) setActive(index); }}
                    role="option"
                    style={depth ? { paddingLeft: 12 + depth * 18 } : undefined}
                  >
                    <span className="ui-option-label">{query && item.path ? item.path : item.label}</span>
                    {item.hint ? <small className="ui-option-hint">{item.hint}</small> : null}
                    {isSelected ? <Check aria-hidden="true" className="ui-option-check" size={16} /> : null}
                  </div>
                );
              })}
            </div>
          </div>,
          portalTarget,
        )
        : null}
    </>
  );
}
