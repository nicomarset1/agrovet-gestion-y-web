"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "./calendar";
import { formatShortDate, parseIsoDate, toIsoDate, today } from "./date-utils";
import { portalTargetFor, usePopoverPosition } from "./use-popover-position";

/**
 * Selector de UNA fecha (portado de proyecto-conmebol): reemplaza al <input type="date">, cuyo
 * calendario es del navegador y no se puede estilizar. Mismo calendario, teclado y posición que
 * DateRangePicker. Valor en formato yyyy-mm-dd; con `name` agrega un input oculto para <form>.
 */
export function DatePicker({
  id,
  value,
  onChange,
  name,
  placeholder = "Elegir fecha",
  ariaLabel,
  disabled,
  invalid,
  min,
  max,
  clearable = true,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  min?: string;
  max?: string;
  clearable?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<Date>(() => parseIsoDate(value) ?? today());
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(open, portalTarget, triggerRef, panelRef, 300);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function toggle() {
    if (open) return close();
    setFocused(parseIsoDate(value) ?? today());
    setPortalTarget(portalTargetFor(triggerRef.current));
    setOpen(true);
  }

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
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
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
  const label = formatShortDate(value);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel ? `${ariaLabel}: ${label || placeholder}` : undefined}
        className={`ui-trigger ui-date-trigger${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        id={id}
        onClick={toggle}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="ui-trigger-icon" size={17} />
        <span className={label ? "ui-trigger-value" : "ui-trigger-placeholder"}>{label || placeholder}</span>
      </button>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      {open && portalTarget
        ? createPortal(
          <div
            aria-label={ariaLabel ?? "Elegir fecha"}
            className={`ui-popover ui-date-popover is-${position.placement}`}
            ref={panelRef}
            role="dialog"
            style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          >
            <Calendar
              dayState={(iso) => ({ selected: iso === value })}
              focusedDate={focused}
              isDisabled={isDisabled}
              labelledBy={titleId}
              onFocusDate={setFocused}
              onSelect={(date) => { onChange(toIsoDate(date)); close(); }}
            />
            <div className="ui-popover-foot">
              <button className="ui-link-button" onClick={() => { onChange(toIsoDate(today())); close(); }} type="button">Hoy</button>
              {clearable && value ? (
                <button className="ui-link-button" onClick={() => { onChange(""); close(); }} type="button">Borrar</button>
              ) : null}
            </div>
          </div>,
          portalTarget,
        )
        : null}
    </>
  );
}
