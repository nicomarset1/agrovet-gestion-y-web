"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Muestra el "cromo" de la tienda (topbar, header, footer) en todo el sitio menos en /admin.
 * El layout raíz no se vuelve a renderizar al navegar, así que la ruta se lee acá, en el cliente:
 * funciona igual al entrar directo a /admin, al ir de la tienda al panel y al volver.
 */
export function StoreChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return children;
}
