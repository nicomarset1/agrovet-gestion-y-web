"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { isCompactContext, portalTargetFor, usePopoverPosition } from "./use-popover-position";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ size?: number }>;
  danger?: boolean;
  disabled?: boolean;
  /** Texto chico debajo, por ejemplo por qué está deshabilitado. */
  hint?: string;
};

/**
 * Botón "⋯" con un menú de acciones (patrón menu button de WAI-ARIA): flechas, Inicio, Fin,
 * Enter, Escape y Tab; el foco vuelve al botón al cerrar. Mismo popover y posición que el Select.
 */
export function MenuButton({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [compact, setCompact] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(open, portalTarget, triggerRef, panelRef, 200);
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function openMenu(start: "first" | "last" = "first") {
    setActive(start === "first" ? enabled[0] ?? 0 : enabled[enabled.length - 1] ?? 0);
    setPortalTarget(portalTargetFor(triggerRef.current));
    setCompact(isCompactContext(triggerRef.current));
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !portalTarget) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, portalTarget]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function run(item: MenuItem) {
    if (item.disabled) return;
    close(false);
    item.onSelect();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const position = enabled.indexOf(active);
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(enabled[(position + 1) % enabled.length]); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(enabled[(position - 1 + enabled.length) % enabled.length]); }
    else if (event.key === "Home") { event.preventDefault(); setActive(enabled[0]); }
    else if (event.key === "End") { event.preventDefault(); setActive(enabled[enabled.length - 1]); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const item = items[active]; if (item) run(item); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") setOpen(false);
  }

  return (
    <>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={`ui-menu-trigger${className ? ` ${className}` : ""}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); openMenu("first"); }
          if (event.key === "ArrowUp") { event.preventDefault(); openMenu("last"); }
        }}
        ref={triggerRef}
        type="button"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && portalTarget
        ? createPortal(
          <div
            aria-activedescendant={`${menuId}-${active}`}
            aria-label={label}
            className={`ui-popover ui-menu is-${position.placement}${compact ? " is-compact" : ""}`}
            id={menuId}
            onKeyDown={onKeyDown}
            ref={panelRef}
            role="menu"
            style={{ top: position.top, left: position.left, minWidth: position.width, maxHeight: position.maxHeight }}
            tabIndex={-1}
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  aria-disabled={item.disabled || undefined}
                  className={`ui-menu-item${index === active ? " is-active" : ""}${item.danger ? " is-danger" : ""}`}
                  id={`${menuId}-${index}`}
                  key={item.label}
                  onClick={() => run(item)}
                  onMouseMove={() => { if (!item.disabled && index !== active) setActive(index); }}
                  role="menuitem"
                >
                  {Icon ? <Icon size={16} /> : null}
                  <span>{item.label}{item.hint ? <small>{item.hint}</small> : null}</span>
                </div>
              );
            })}
          </div>,
          portalTarget,
        )
        : null}
    </>
  );
}
