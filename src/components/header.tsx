import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { MapPin } from "lucide-react";
import { getCatalogMenu, getSearchIndex } from "@/lib/db";
import { CatalogMenu } from "./catalog-menu";
import { CartButton } from "./cart-button";
import { HeaderCompact } from "./header-compact";
import { LiveSearch } from "./live-search";
import { SmoothAnchor } from "./smooth-anchor";
import { StoreNavLink } from "./store-nav-link";

export async function Header() {
  noStore();
  const [menuItems, searchProducts] = await Promise.all([getCatalogMenu(), getSearchIndex()]);
  return (
    <>
      <aside className="topbar" aria-label="Beneficios">
        <div className="container topbar-inner">
          <div className="topbar-track">
            <span>10% de descuento en efectivo en sucursal</span>
            <span>Stock visible por sucursal</span>
            <span>Asesoramiento veterinario</span>
            {/* Copia para el desplazamiento continuo en celular: los lectores de pantalla no la repiten. */}
            <span aria-hidden="true">10% de descuento en efectivo en sucursal</span>
            <span aria-hidden="true">Stock visible por sucursal</span>
            <span aria-hidden="true">Asesoramiento veterinario</span>
          </div>
        </div>
      </aside>
      <header className="header">
        <HeaderCompact />
        <div className="container header-main">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-title">Agrovet<span className="brand-subtitle">Mar del Plata</span></span>
          </Link>
          <CatalogMenu items={menuItems} />
          <LiveSearch products={searchProducts} />
          <nav aria-label="Principal" className="navigation">
            <StoreNavLink />
            <SmoothAnchor href="/#locales"><MapPin size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Locales</SmoothAnchor>
            <CartButton />
          </nav>
        </div>
      </header>
    </>
  );
}
