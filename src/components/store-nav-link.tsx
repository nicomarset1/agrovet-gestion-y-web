"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

export function StoreNavLink() {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname !== "/tienda") return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <Link href="/tienda" onClick={handleClick}>Tienda</Link>;
}
