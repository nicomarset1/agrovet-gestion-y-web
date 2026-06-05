import Link from "next/link";
import Image from "next/image";
import { Award, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { BranchesSection } from "@/components/branches-section";
import { CategoryCards } from "@/components/category-cards";
import { ProductCard } from "@/components/product-card";
import { getBranches, getFeaturedProducts } from "@/lib/db";

export default async function Home() {
  const [featured, branches] = await Promise.all([getFeaturedProducts(), getBranches()]);
  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-box hero-image-box">
            <Image
              alt="Todo para tu mascota en un solo lugar: alimentos, accesorios y medicamentos"
              className="hero-main-image"
              fill
              priority
              sizes="(max-width: 640px) calc(100vw - 28px), 1240px"
              src="/home-assets/hero-pets-clean.png"
            />
            <Image
              alt=""
              className="hero-mobile-image"
              fill
              priority
              sizes="calc(100vw - 28px)"
              src="/home-assets/hero-pets-mobile-clean.png"
            />
            <Link className="hero-buy-button" href="/tienda">
              <ShoppingCart size={22} />
              Comprar ahora
            </Link>
          </div>
          <div className="trust-grid">
            <div className="trust-item"><Truck /><div><strong>Envíos a todo Mar del Plata</strong><span>Rápidos y seguros</span></div></div>
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
