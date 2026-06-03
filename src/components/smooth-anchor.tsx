"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function SmoothAnchor({ children, className, href }: { children: ReactNode; className?: string; href: string }) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!href.startsWith("/#")) return;
    const target = document.getElementById(href.slice(2));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", href);
  }

  return <Link className={className} href={href} onClick={handleClick}>{children}</Link>;
}
