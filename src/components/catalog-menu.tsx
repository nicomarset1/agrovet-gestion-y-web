"use client";

import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogMenuNode } from "@/lib/types";

function MenuLevel({ items, level = 0, onNavigate }: { items: CatalogMenuNode[]; level?: number; onNavigate: () => void }) {
  return (
    <ul className={`catalog-menu-list level-${level}`}>
      {items.map((item) => (
        <li className="catalog-menu-item" key={`${level}-${item.href}`}>
          <Link href={item.href} onClick={onNavigate}>
            <span>{item.label}</span>
            {typeof item.count === "number" ? <small>{item.count}</small> : null}
            {item.children?.length ? <ChevronRight size={15} /> : null}
          </Link>
          {item.children?.length ? <MenuLevel items={item.children} level={level + 1} onNavigate={onNavigate} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function CatalogMenu({ items }: { items: CatalogMenuNode[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className={`catalog-menu ${open ? "open" : ""}`} ref={menuRef}>
      <button
        className="catalog-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu size={21} />
        <span>Categorías</span>
      </button>
      <MenuLevel items={items} onNavigate={() => setOpen(false)} />
    </div>
  );
}
