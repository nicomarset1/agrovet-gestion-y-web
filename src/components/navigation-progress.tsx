"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Si la navegación no termina en este tiempo (por ejemplo, un error), la barra se oculta igual.
const MAX_VISIBLE_MS = 10000;

/**
 * Barra fina de progreso arriba de todo mientras se navega a otra página.
 * Reemplaza al loading.tsx global: aquel abría el stream con 200 antes de que una página pudiera
 * responder 404 (notFound), y /producto/inexistente quedaba como "soft 404". Esta barra vive solo
 * en el cliente: aparece al tocar un link interno y se oculta cuando cambia la URL.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams.toString()}`;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  // Cuando la URL cambia, la navegación terminó: se oculta la barra.
  const [seenUrl, setSeenUrl] = useState(url);
  if (url !== seenUrl) {
    setSeenUrl(url);
    setPendingFrom(null);
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      // Solo cambios de página: los filtros de la misma página, las anclas (#locales) y los links que
      // solo hacen scroll (Tienda estando en /tienda) no esperan una respuesta nueva.
      if (next.pathname === current.pathname) return;
      setPendingFrom(window.location.pathname + window.location.search);
    }
    // En captura: next/link cancela el evento en su propio onClick para navegar sin recargar.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pendingFrom) return;
    const timer = window.setTimeout(() => setPendingFrom(null), MAX_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [pendingFrom]);

  return <div aria-hidden="true" className={`nav-progress${pendingFrom ? " is-active" : ""}`} />;
}
