"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, type DayState } from "./calendar";
import { addDays, endOfMonth, formatRange, parseIsoDate, startOfMonth, toIsoDate, today } from "./date-utils";
import { portalTargetFor, usePopoverPosition } from "./use-popover-position";

type Shortcut = { label: string; range: () => [Date, Date] };

const SHORTCUTS: Shortcut[] = [
  { label: "Hoy", range: () => [today(), today()] },
  { label: "Ayer", range: () => [addDays(today(), -1), addDays(today(), -1)] },
  { label: "Últimos 7 días", range: () => [addDays(today(), -6), today()] },
  { label: "Este mes", range: () => [startOfMonth(today()), today()] },
  { label: "Mes pasado", range: () => { const previous = startOfMonth(addDays(startOfMonth(today()), -1)); return [previous, endOfMonth(previous)]; } },
];

/**
 * Selector de RANGO de fechas en un solo control (portado de proyecto-conmebol).
 *
 * Interacción: el primer clic marca el inicio (el botón lo muestra al toque y el panel queda
 * abierto); el segundo marca el fin y se ordenan solos, así el segundo clic puede ser anterior
 * al primero. Dos clics en la misma fecha eligen un solo día. Mientras se elige, el rango se ve
 * "encerrado" hasta el día bajo el mouse o el foco. Un clic después de un rango completo arranca
 * uno nuevo. onChange se llama solo con el rango completo (o vacío al borrar), así quien lo usa
 * no recibe rangos a medias.
 *
 * Valores en formato yyyy-mm-dd. Con nameFrom / nameTo agrega inputs ocultos para usarlo en un <form>.
 */
export function DateRangePicker({
  id,
  from,
  to,
  onChange,
  nameFrom,
  nameTo,
  placeholder = "Elegir fechas",
  ariaLabel,
  disabled,
  min,
  max,
  shortcuts = true,
  clearable = true,
  className,
}: {
  id?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  nameFrom?: string;
  nameTo?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  shortcuts?: boolean;
  clearable?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<Date>(() => parseIsoDate(from) ?? today());
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(open, portalTarget, triggerRef, panelRef, 300);

  function close(returnFocus = true) {
    setOpen(false);
    setAnchor(null);
    setHover(null);
    if (returnFocus) triggerRef.current?.focus();
  }

  function toggle() {
    if (open) return close();
    setFocused(parseIsoDate(from) ?? today());
    setAnchor(null);
    setHover(null);
    setPortalTarget(portalTargetFor(triggerRef.current));
    setOpen(true);
  }

  // Al abrir, el foco va al día activo del calendario.
  useEffect(() => {
    if (!open || !portalTarget) return;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(".ui-day[tabindex='0']")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, portalTarget]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);
  const isDisabled = (date: Date) => Boolean((minDate && date < minDate) || (maxDate && date > maxDate));

  function select(date: Date) {
    if (!anchor) {
      setAnchor(date);
      setHover(date);
      return;
    }
    const [start, end] = date < anchor ? [date, anchor] : [anchor, date];
    onChange(toIsoDate(start), toIsoDate(end));
    close();
  }

  function applyShortcut(shortcut: Shortcut) {
    const [start, end] = shortcut.range();
    onChange(toIsoDate(start), toIsoDate(end));
    close();
  }

  function dayState(iso: string): DayState {
    let start = from;
    let end = to;
    if (anchor) {
      const a = toIsoDate(anchor);
      const b = toIsoDate(hover ?? anchor);
      [start, end] = a <= b ? [a, b] : [b, a];
    }
    if (!start) return {};
    if (!end) return { selected: iso === start, rangeStart: iso === start, rangeEnd: iso === start };
    return {
      selected: iso === start || iso === end,
      rangeStart: iso === start,
      rangeEnd: iso === end,
      inRange: iso > start && iso < end,
    };
  }

  const draftLabel = anchor ? formatRange(toIsoDate(anchor), "") : "";
  const label = draftLabel || formatRange(from, to);
  const shortcutActive = (shortcut: Shortcut) => {
    const [start, end] = shortcut.range();
    return !anchor && from === toIsoDate(start) && to === toIsoDate(end);
  };

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel ? `${ariaLabel}: ${label || placeholder}` : undefined}
        className={`ui-trigger ui-date-trigger${className ? ` ${className}` : ""}`}
        disabled={disabled}
        id={id}
        onClick={toggle}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="ui-trigger-icon" size={17} />
        <span className={label ? "ui-trigger-value" : "ui-trigger-placeholder"}>{label || placeholder}</span>
      </button>
      {nameFrom ? <input name={nameFrom} type="hidden" value={from} /> : null}
      {nameTo ? <input name={nameTo} type="hidden" value={to} /> : null}
      {open && portalTarget
        ? createPortal(
          <div
            aria-label={ariaLabel ?? "Elegir rango de fechas"}
            className={`ui-popover ui-date-popover is-${position.placement}`}
            ref={panelRef}
            role="dialog"
            style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          >
            {shortcuts ? (
              <div aria-label="Atajos" className="ui-date-shortcuts" role="group">
                {SHORTCUTS.map((shortcut) => (
                  <button
                    aria-pressed={shortcutActive(shortcut)}
                    className="ui-chip"
                    key={shortcut.label}
                    onClick={() => applyShortcut(shortcut)}
                    type="button"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
            ) : null}
            <Calendar
              dayState={dayState}
              focusedDate={focused}
              isDisabled={isDisabled}
              labelledBy={titleId}
              onFocusDate={setFocused}
              onHover={(date) => { if (anchor) setHover(date); }}
              onSelect={select}
            />
            <div className="ui-popover-foot">
              <span aria-live="polite" className="ui-date-hint">
                {anchor ? "Elegí la fecha de fin (o la misma para un solo día)" : "Elegí la fecha de inicio"}
              </span>
              {clearable && (from || to) ? (
                <button className="ui-link-button" onClick={() => { onChange("", ""); close(); }} type="button">Borrar</button>
              ) : null}
            </div>
          </div>,
          portalTarget,
        )
        : null}
    </>
  );
}
