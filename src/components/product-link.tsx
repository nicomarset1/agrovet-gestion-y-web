"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

export function ProductLink({ children, className, slug }: { children: ReactNode; className?: string; slug: string }) {
  const href = `/producto/${slug}?back=${encodeURIComponent("/tienda")}`;

  function preserveBack(event: MouseEvent<HTMLAnchorElement>) {
    const current = `${window.location.pathname}${window.location.search}`;
    if (current.startsWith("/tienda")) {
      event.currentTarget.href = `/producto/${slug}?back=${encodeURIComponent(current)}`;
    }
  }

  return <Link className={className} href={href} onClick={preserveBack}>{children}</Link>;
}
