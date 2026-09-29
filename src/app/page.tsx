import type { Metadata } from "next";
import Link from "next/link";
import { getImageProps } from "next/image";
import { Award, BadgePercent, CreditCard, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { BranchesSection } from "@/components/branches-section";
import { CategoryCards } from "@/components/category-cards";
import { ProductCard } from "@/components/product-card";
import { getBranches, getFeaturedProducts } from "@/lib/db";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const {
  props: { srcSet: heroMobile },
} = getImageProps({
  alt: "",
  src: "/home-assets/hero-mobile-no-logo.png",
  width: 1254,
  height: 1254,
  sizes: "calc(100vw - 28px)",
});
const { props: heroDesktop } = getImageProps({
  alt: "",
  src: "/home-assets/hero-pets-clean.png",
  width: 1536,
  height: 560,
  sizes: "(max-width: 1280px) calc(100vw - 40px), 1240px",
  loading: "eager",
  fetchPriority: "high",
});

export default async function Home() {
  const [featured, branches] = await Promise.all([getFeaturedProducts(), getBranches()]);
  return (
    <>
      <section className="hero">
        <h1 className="sr-only">Agrovet Mar del Plata: alimentos, accesorios y farmacia para perros y gatos</h1>
        <div className="container">
          <div className="hero-box hero-image-box">
            {/* Un solo <img> con art direction: cada dispositivo descarga solo su versión del hero. */}
            <picture className="hero-picture">
              <source media="(max-width: 640px)" srcSet={heroMobile} sizes="calc(100vw - 28px)" />
              <img {...heroDesktop} alt="Todo para tu mascota en un solo lugar: alimentos, accesorios y medicamentos" className="hero-picture-image" />
            </picture>
            <Link className="hero-buy-button" href="/tienda">
              <ShoppingCart size={22} />
              Comprar ahora
            </Link>
          </div>
          <div className="hero-promo-ticker" aria-label="Beneficios destacados">
            <div className="hero-promo-track">
              <div className="hero-promo-sequence">
                <div className="hero-promo-tag"><CreditCard /><strong>Promociones con tarjetas</strong><span>Beneficios todos los días</span></div>
                <div className="hero-promo-tag"><BadgePercent /><strong>10% en efectivo</strong><span>Pagando en sucursal</span></div>
                <div className="hero-promo-tag"><Truck /><strong>Envíos sin cargo</strong><span>Zona sucursal Independencia</span></div>
                <div className="hero-promo-tag"><BadgePercent /><strong>3 cuotas sin interés</strong><span>Más reintegros Favacard</span></div>
              </div>
              <div className="hero-promo-sequence" aria-hidden="true">
                <div className="hero-promo-tag"><CreditCard /><strong>Promociones con tarjetas</strong><span>Beneficios todos los días</span></div>
                <div className="hero-promo-tag"><BadgePercent /><strong>10% en efectivo</strong><span>Pagando en sucursal</span></div>
                <div className="hero-promo-tag"><Truck /><strong>Envíos sin cargo</strong><span>Zona sucursal Independencia</span></div>
                <div className="hero-promo-tag"><BadgePercent /><strong>3 cuotas sin interés</strong><span>Más reintegros Favacard</span></div>
              </div>
            </div>
          </div>
          <div className="trust-grid">
            <div className="trust-item"><Truck /><div><strong>Envíos en zona cercana</strong><span>Direcciones dentro de 3 km de la sucursal de Av. Independencia</span></div></div>
            <div className="trust-item"><ShieldCheck /><div><strong>Productos de calidad</strong><span>Elegidos para el bienestar de tu mascota</span></div></div>
            <div className="trust-item"><Award /><div><strong>Las mejores marcas</strong><span>Alimentos, accesorios y medicamentos premium</span></div></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">Explorá</p><h2 className="display">Categorías</h2></div>
            <Link className="button button-light" href="/tienda">Ver todo</Link>
          </div>
          <CategoryCards />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">Elegidos para vos</p><h2 className="display">Productos destacados</h2></div>
            <Link className="button button-accent" href="/tienda?stock=disponible">Comprar disponible</Link>
          </div>
          <div className="product-grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        </div>
      </section>
      <BranchesSection branches={branches} />
    </>
  );
}
