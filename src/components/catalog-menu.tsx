"use client";

import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogMenuNode } from "@/lib/types";

function MenuLevel({
  items,
  level = 0,
  isMobile,
  openPath,
  onToggle,
  onNavigate,
}: {
  items: CatalogMenuNode[];
  level?: number;
  isMobile: boolean;
  openPath: string[];
  onToggle: (href: string, level: number) => void;
  onNavigate: () => void;
}) {
  return (
    <ul className={`catalog-menu-list level-${level}`}>
      {items.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const expanded = openPath[level] === item.href;
        return (
          <li className={`catalog-menu-item${expanded ? " expanded" : ""}`} key={`${level}-${item.href}`}>
            {hasChildren && isMobile ? (
              <div
                aria-expanded={expanded}
                className="catalog-menu-link catalog-menu-branch"
                onClick={() => onToggle(item.href, level)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle(item.href, level);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <Link
                  className="catalog-menu-label-link"
                  href={item.href}
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {item.label}
                </Link>
                <span aria-hidden="true" className="catalog-menu-row-fill" />
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
                <ChevronRight size={15} />
              </div>
            ) : hasChildren ? (
              <Link className="catalog-menu-link" href={item.href} onClick={onNavigate}>
                <span>{item.label}</span>
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
                <ChevronRight size={15} />
              </Link>
            ) : (
              <Link className="catalog-menu-link" href={item.href} onClick={onNavigate}>
                <span>{item.label}</span>
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
              </Link>
            )}
            {hasChildren ? (
              <MenuLevel
                items={item.children ?? []}
                level={level + 1}
                isMobile={isMobile}
                openPath={openPath}
                onToggle={onToggle}
                onNavigate={onNavigate}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CatalogMenu({ items }: { items: CatalogMenuNode[] }) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openPath, setOpenPath] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const updateMode = () => {
      setIsMobile(query.matches);
      if (!query.matches) setOpenPath([]);
    };

    updateMode();
    query.addEventListener("change", updateMode);
    return () => query.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setOpenPath([]);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setOpenPath([]);
      }
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function closeMenu() {
    setOpen(false);
    setOpenPath([]);
  }

  function toggleNode(href: string, level: number) {
    if (openPath[level] === href) {
      setOpenPath((current) => current.slice(0, level));
      return;
    }
    setOpenPath((current) => [...current.slice(0, level), href]);
  }

  return (
    <div className={`catalog-menu ${open ? "open" : ""}`} ref={menuRef}>
      <button
        className="catalog-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => {
            if (current) setOpenPath([]);
            return !current;
          });
        }}
      >
        <Menu size={21} />
        <span>Categorías</span>
      </button>
      <MenuLevel
        items={items}
        isMobile={isMobile}
        openPath={openPath}
        onToggle={toggleNode}
        onNavigate={closeMenu}
      />
    </div>
  );
}
