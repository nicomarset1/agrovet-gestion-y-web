"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function ProductLink({ children, className, slug }: { children: ReactNode; className?: string; slug: string }) {
  const router = useRouter();
  const href = `/producto/${slug}?back=${encodeURIComponent("/tienda")}`;

  // Guarda la URL actual de la tienda (filtros, orden y cantidad cargada) para que "Volver a productos" la recupere.
  function hrefWithBack() {
    const current = `${window.location.pathname}${window.location.search}`;
    return current.startsWith("/tienda") ? `/producto/${slug}?back=${encodeURIComponent(current)}` : href;
  }

  function preserveBack(event: MouseEvent<HTMLAnchorElement>) {
    const next = hrefWithBack();
    // Nueva pestaña o ventana: alcanza con actualizar el href real del link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      event.currentTarget.href = next;
      return;
    }
    event.preventDefault();
    router.push(next);
  }

  return (
    <Link
      className={className}
      href={href}
      onClick={preserveBack}
      onContextMenu={(event) => { event.currentTarget.href = hrefWithBack(); }}
    >
      {children}
    </Link>
  );
}
