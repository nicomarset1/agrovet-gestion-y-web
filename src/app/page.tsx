import Link from "next/link";
import { BadgeCheck, MapPin, Truck } from "lucide-react";
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
          <div className="hero-box">
            <div className="hero-content">
              <p className="eyebrow">Cuidamos lo que más querés</p>
              <h1 className="display">Todo para tu mascota, en un solo lugar.</h1>
              <p>Alimentos premium, accesorios y farmacia para perros y gatos. Comprá online con disponibilidad visible en cada sucursal.</p>
              <div className="hero-actions">
                <Link className="button button-primary" href="/tienda">Ver productos</Link>
                <Link className="button button-light" href="/tienda?category=alimentos">Comprar alimento</Link>
              </div>
            </div>
            <span className="hero-shape" />
            <div className="pet-illustration" aria-hidden="true">
              <span className="pet-ear left" /><span className="pet-ear right" />
              <span className="pet-head" /><span className="pet-muzzle" /><span className="pet-nose" />
              <span className="pet-eye left" /><span className="pet-eye right" />
            </div>
          </div>
          <div className="trust-grid">
            <div className="trust-item"><Truck /><div><strong>Envíos en Mar del Plata</strong><span>Coordiná entrega en la ciudad</span></div></div>
            <div className="trust-item"><BadgeCheck /><div><strong>Productos seleccionados</strong><span>Marcas reconocidas</span></div></div>
            <div className="trust-item"><MapPin /><div><strong>Stock por sucursal</strong><span>Disponibilidad antes de comprar</span></div></div>
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
