import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { MapPin } from "lucide-react";
import { getCatalogMenu, getSearchIndex } from "@/lib/db";
import { CatalogMenu } from "./catalog-menu";
import { CartButton } from "./cart-button";
import { LiveSearch } from "./live-search";
import { SmoothAnchor } from "./smooth-anchor";

export function Header() {
  noStore();
  const menuItems = getCatalogMenu();
  const searchProducts = getSearchIndex();
  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <div className="topbar-track">
            <span>Envíos gratis en Mar del Plata de lunes a sábados según zona</span>
            <span>Stock visible por sucursal</span>
            <span>Asesoramiento veterinario</span>
            <span>Envíos gratis en Mar del Plata de lunes a sábados según zona</span>
            <span>Stock visible por sucursal</span>
            <span>Asesoramiento veterinario</span>
          </div>
        </div>
      </div>
      <header className="header">
        <div className="container header-main">
          <Link className="brand" href="/">
            <span className="brand-mark">A</span>
            <span className="brand-title">Agrovet<span className="brand-subtitle">Mar del Plata</span></span>
          </Link>
          <CatalogMenu items={menuItems} />
          <LiveSearch products={searchProducts} />
          <nav className="navigation">
            <Link href="/tienda">Tienda</Link>
            <SmoothAnchor href="/#locales"><MapPin size={15} style={{ display: "inline", verticalAlign: "-2px" }} /> Locales</SmoothAnchor>
            <CartButton />
          </nav>
        </div>
      </header>
    </>
  );
}
