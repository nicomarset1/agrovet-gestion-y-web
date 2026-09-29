"use client";

import Link from "next/link";
import { ArrowLeft, Bone, Cat, ChevronRight, CircleHelp, Dog, Mail, Menu, Percent, Tags, Truck, Utensils, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogMenuNode } from "@/lib/types";

const sectionIcons = {
  Perros: Dog,
  Gatos: Cat,
  Alimentos: Utensils,
  Accesorios: Tags,
  "Promociones bancarias": Percent,
  Envios: Truck,
  "Preguntas frecuentes": CircleHelp,
  Contacto: Mail,
} as const;

function MobileDrilldown({
  items,
  openPath,
  onBack,
  onEnter,
  onNavigate,
}: {
  items: CatalogMenuNode[];
  openPath: string[];
  onBack: () => void;
  onEnter: (label: string) => void;
  onNavigate: () => void;
}) {
  let currentItems = items;
  let current: CatalogMenuNode | undefined;
  for (const label of openPath) {
    current = currentItems.find((item) => item.label === label);
    if (!current) break;
    currentItems = current.children ?? [];
  }

  return (
    <>
      <div className="catalog-mobile-head">
        <button
          aria-label="Volver"
          className={`catalog-mobile-back${openPath.length ? " visible" : ""}`}
          disabled={!openPath.length}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={23} />
        </button>
        <div>
          <span>{openPath.length ? "Categoría" : "Agrovet"}</span>
          <strong>{current?.label ?? "Categorías"}</strong>
        </div>
        <button aria-label="Cerrar menú" onClick={onNavigate} type="button"><X size={25} /></button>
      </div>
      <div className="catalog-mobile-stage" key={current?.label ?? "root"}>
        {current ? (
          <Link className="catalog-mobile-view-all" href={current.href} onClick={onNavigate}>
            Ver todo en {current.label} <ChevronRight size={16} />
          </Link>
        ) : null}
        <ul className="catalog-mobile-list">
      {currentItems.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const Icon = !openPath.length ? sectionIcons[item.label as keyof typeof sectionIcons] ?? Bone : null;
        return (
          <li key={`${current?.label ?? "root"}-${item.label}`}>
            {hasChildren ? (
              <button className="catalog-mobile-row" onClick={() => onEnter(item.label)} type="button">
                {Icon ? <Icon className="catalog-mobile-row-icon" size={21} /> : null}
                <span>{item.label}</span>
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
                <ChevronRight size={15} />
              </button>
            ) : (
              <Link className="catalog-mobile-row" href={item.href} onClick={onNavigate}>
                {Icon ? <Icon className="catalog-mobile-row-icon" size={20} /> : null}
                <span>{item.label}</span>
                {typeof item.count === "number" ? <small>{item.count}</small> : null}
              </Link>
            )}
          </li>
        );
      })}
        </ul>
      </div>
    </>
  );
}

function MegaMenu({
  activeHref,
  items,
  onActivate,
  onNavigate,
}: {
  activeHref: string;
  items: CatalogMenuNode[];
  onActivate: (href: string) => void;
  onNavigate: () => void;
}) {
  const active = items.find((item) => item.href === activeHref && item.children?.length);

  return (
    <div className={`catalog-mega${active ? "" : " compact"}`}>
      <button className="catalog-mega-close" aria-label="Cerrar categorías" onClick={onNavigate} type="button">
        <X size={22} />
      </button>
      <nav className="catalog-mega-rail" aria-label="Secciones del catálogo">
        {items.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const selected = active?.href === item.href;
          const Icon = sectionIcons[item.label as keyof typeof sectionIcons] ?? Bone;
          return hasChildren ? (
            <div
              className={`catalog-mega-root${selected ? " active" : ""}`}
              key={item.label}
              onFocus={() => onActivate(item.href)}
              onMouseEnter={() => onActivate(item.href)}
            >
              <Icon size={21} />
              <Link href={item.href} onClick={onNavigate}>{item.label}</Link>
              {typeof item.count === "number" ? <small>{item.count}</small> : null}
              <ChevronRight size={15} />
            </div>
          ) : (
            <Link
              className="catalog-mega-root"
              href={item.href}
              key={item.label}
              onClick={onNavigate}
              onFocus={() => onActivate("")}
              onMouseEnter={() => onActivate("")}
            >
              <Icon size={21} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {active ? (
        <section className="catalog-mega-content" aria-label={`Opciones de ${active.label}`} key={active.label}>
          <div className="catalog-mega-heading">
            <div>
              <span>Explorá</span>
              <h2>{active.label}</h2>
            </div>
            <Link href={active.href} onClick={onNavigate}>Ver todo <ChevronRight size={15} /></Link>
          </div>
          <div className="catalog-mega-groups">
            {active.children?.map((group) => (
              <div className="catalog-mega-group" key={`${active.label}-${group.label}`}>
                <Link className="catalog-mega-group-title" href={group.href} onClick={onNavigate}>{group.label}</Link>
                <div className="catalog-mega-links">
                  {(group.children ?? []).map((item) => (
                    <Link href={item.href} key={`${group.label}-${item.label}`} onClick={onNavigate}>
                      <span>{item.label}</span>
                      {typeof item.count === "number" ? <small>{item.count}</small> : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function CatalogMenu({ items }: { items: CatalogMenuNode[] }) {
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [activeHref, setActiveHref] = useState(items.find((item) => item.children?.length)?.href ?? "");
  const [openPath, setOpenPath] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const lockedScrollY = useRef(0);
  const hoverOpenedAt = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 821px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || desktop) return;
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = html.style.overflow;
    lockedScrollY.current = window.scrollY;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY.current}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, lockedScrollY.current);
    };
  }, [desktop, open]);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setOpenPath([]);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menuRef.current?.classList.contains("open")) return;
      setOpen(false);
      setOpenPath([]);
      // Al cerrar con Escape el foco vuelve al botón, no se pierde en el body.
      triggerRef.current?.focus();
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

  // Teclado: al abrir (o al cambiar de nivel en el celular) el foco entra al menú.
  useEffect(() => {
    if (!open) return;
    const root = desktop ? menuRef.current?.querySelector<HTMLElement>(".catalog-mega") : drawerRef.current;
    if (!root) return;
    const inside = root.contains(document.activeElement);
    if (!focusOnOpen.current && !(inside && !desktop)) return;
    focusOnOpen.current = false;
    const target = desktop
      ? root.querySelector<HTMLElement>(".catalog-mega-rail a")
      : root.querySelector<HTMLElement>(".catalog-mobile-stage a, .catalog-mobile-stage button");
    // Se espera un momento a que el panel deje de estar oculto (visibility) para poder enfocarlo.
    const timer = window.setTimeout(() => target?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(timer);
  }, [open, desktop, openPath]);

  // En el celular el drawer es modal: Tab y Shift+Tab quedan dentro mientras está abierto.
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`catalog-menu ${open ? "open" : ""}`}
      onMouseEnter={() => {
        if (!desktop) return;
        if (!open) hoverOpenedAt.current = Date.now();
        setOpen(true);
        setActiveHref((current) => current || items.find((item) => item.children?.length)?.href || "");
      }}
      onMouseLeave={() => {
        if (!desktop) return;
        setOpen(false);
        setActiveHref("");
      }}
      onBlur={(event) => {
        // En escritorio, salir del menú con Tab lo cierra.
        if (desktop && open && !menuRef.current?.contains(event.relatedTarget as Node | null)) closeMenu();
      }}
      ref={menuRef}
    >
      <button
        className="catalog-trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        ref={triggerRef}
        onClick={(event) => {
          // detail 0 = activado con teclado (Enter o espacio): el foco pasa al menú.
          if (event.detail === 0 || !desktop) focusOnOpen.current = true;
          // En escritorio el hover ya abre el menú: si el clic llega justo después, no lo cierra.
          if (desktop && Date.now() - hoverOpenedAt.current < 450) {
            setOpen(true);
            return;
          }
          setOpen((current) => {
            if (current) setOpenPath([]);
            return !current;
          });
        }}
      >
        <Menu size={21} />
        <span>Categorías</span>
      </button>
      {desktop ? (
        <MegaMenu
          activeHref={activeHref}
          items={items}
          onActivate={setActiveHref}
          onNavigate={closeMenu}
        />
      ) : (
        <>
          <button className="catalog-mobile-overlay" aria-hidden="true" onClick={closeMenu} tabIndex={-1} type="button" />
          <div
            aria-hidden={!open}
            aria-label="Categorías"
            aria-modal={open ? true : undefined}
            className="catalog-mobile-drawer"
            onKeyDown={trapFocus}
            ref={drawerRef}
            role={open ? "dialog" : undefined}
          >
            <MobileDrilldown
              items={items}
              openPath={openPath}
              onBack={() => setOpenPath((current) => current.slice(0, -1))}
              onEnter={(label) => setOpenPath((current) => [...current, label])}
              onNavigate={closeMenu}
            />
          </div>
        </>
      )}
    </div>
  );
}
