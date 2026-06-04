import Link from "next/link";
import { CalendarDays, CreditCard, Info, RefreshCcw } from "lucide-react";
import { getSpecialPageDescription } from "@/lib/special-page-content";

export const metadata = { title: "Promociones bancarias" };
export const dynamic = "force-dynamic";

export default async function PromocionesBancariasPage() {
  const description = await getSpecialPageDescription(
    "promociones-bancarias",
    "Aprovecha cuotas sin interes y beneficios especiales con Favacard en Agrovet Mar del Plata.",
  );
  const intro = description.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? "Aprovecha cuotas sin interes y beneficios especiales con Favacard en Agrovet Mar del Plata.";
  const promos = [
    {
      icon: CreditCard,
      eyebrow: "Todas las tarjetas",
      title: "2 cuotas sin interes",
      description: "Disponible con cualquier tarjeta para compras en Agrovet.",
      highlight: "Todos los dias",
    },
    {
      icon: CalendarDays,
      eyebrow: "Favacard",
      title: "3 cuotas sin interes",
      description: "Beneficio exclusivo con Favacard para financiar tus compras sin interes.",
      highlight: "Todos los dias",
    },
    {
      icon: RefreshCcw,
      eyebrow: "Favacard",
      title: "20% de reintegro",
      description: "Los viernes y sabados tenes reintegro pagando con Favacard. El tope puede variar segun la promocion vigente.",
      highlight: "Viernes y sabados",
    },
  ];

  return (
    <main className="promo-page section">
      <div className="container">
        <section className="promo-hero">
          <div>
            <p className="eyebrow">Agrovet Mar del Plata</p>
            <h1>Promociones bancarias</h1>
            <p>{intro}</p>
          </div>
          <Link className="button button-light" href="/tienda">Comprar ahora</Link>
        </section>

        <section className="promo-grid" aria-label="Promociones disponibles">
          {promos.map((promo) => {
            const Icon = promo.icon;
            return (
              <article className="card promo-card" key={promo.title}>
                <div className="promo-card-head">
                  <span className="promo-icon"><Icon size={24} /></span>
                  <span>{promo.eyebrow}</span>
                </div>
                <strong>{promo.title}</strong>
                <p>{promo.description}</p>
                <small>{promo.highlight}</small>
              </article>
            );
          })}
        </section>

        <section className="card promo-note">
          <Info size={21} />
          <div>
            <h2>Condiciones</h2>
            <p>Las promociones pueden estar sujetas a condiciones de la tarjeta o entidad emisora. En el reintegro de Favacard, el tope varia segun la promocion vigente; consultanos antes de confirmar la compra si queres validar el beneficio exacto.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
