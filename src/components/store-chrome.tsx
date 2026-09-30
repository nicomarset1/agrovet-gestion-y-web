"use client";

import { usePathname } from "next/navigation";
import { isPanelPath } from "@/lib/panel-route";
import type { ReactNode } from "react";

/**
 * Muestra el "cromo" de la tienda (topbar, header, footer) en todo el sitio menos en el panel.
 * El layout raíz no se vuelve a renderizar al navegar, así que la ruta se lee acá, en el cliente:
 * funciona igual al entrar directo al panel, al ir de la tienda al panel y al volver.
 */
export function StoreChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPanelPath(pathname)) return null;
  return children;
}
