"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

const MARGIN = 8;
const GAP = 6;

export type PopoverPosition = { top: number; left: number; width: number; maxHeight: number; placement: "bottom" | "top" };

/**
 * Posición (fixed) de un panel desplegable anclado a su botón, compartida por DatePicker,
 * DateRangePicker y Select (portado de proyecto-conmebol). Si no entra abajo se abre arriba,
 * nunca se sale por los costados y, si no entra en ningún lado, limita el alto (maxHeight)
 * para que la lista haga scroll dentro del panel en vez de quedar cortada.
 *
 * Se recalcula en un layout effect cuando el panel ya está montado, así la posición final
 * se aplica antes de pintar y no se ve el salto. También sigue al botón si la página se mueve.
 */
export function usePopoverPosition(
  open: boolean,
  ready: unknown,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  minWidth = 0,
) {
  const [position, setPosition] = useState<PopoverPosition>({ top: -9999, left: -9999, width: 0, maxHeight: 360, placement: "bottom" });

  useLayoutEffect(() => {
    if (!open) return;
    function calculate() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const width = Math.min(Math.max(trigger.width, minWidth), viewportWidth - MARGIN * 2);
      const naturalHeight = panel.scrollHeight;
      const below = viewportHeight - trigger.bottom - GAP - MARGIN;
      const above = trigger.top - GAP - MARGIN;
      let placement: "bottom" | "top" = "bottom";
      let maxHeight = below;
      if (naturalHeight > below && above > below) {
        placement = "top";
        maxHeight = above;
      }
      maxHeight = Math.max(160, maxHeight);
      const height = Math.min(naturalHeight, maxHeight);
      const top = placement === "bottom"
        ? Math.min(trigger.bottom + GAP, viewportHeight - MARGIN - height)
        : Math.max(MARGIN, trigger.top - GAP - height);
      const panelWidth = Math.max(width, panel.offsetWidth);
      const left = Math.max(MARGIN, Math.min(trigger.left, viewportWidth - MARGIN - panelWidth));
      setPosition({ top, left, width, maxHeight, placement });
    }
    calculate();
    window.addEventListener("resize", calculate);
    window.addEventListener("scroll", calculate, true);
    return () => {
      window.removeEventListener("resize", calculate);
      window.removeEventListener("scroll", calculate, true);
    };
  }, [open, ready, triggerRef, panelRef, minWidth]);

  return position;
}

/** Dónde portalear el panel: dentro de un <dialog> abierto (top layer) o en el body. */
export function portalTargetFor(trigger: HTMLElement | null): Element {
  return trigger?.closest("dialog") ?? document.body;
}
