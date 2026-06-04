import { Clock, CreditCard, Store, Truck } from "lucide-react";
import { DeliveryZoneChecker } from "@/components/delivery-zone-checker";
import { getSpecialPageDescription } from "@/lib/special-page-content";

export const metadata = { title: "Envíos" };
export const dynamic = "force-dynamic";

const fallbackDescription = "Hacemos envíos gratis dentro de la zona de reparto para compras desde $ 50.000. Verificá tu dirección antes de finalizar el pedido.";

export default async function EnviosPage() {
  const description = await getSpecialPageDescription("envios", fallbackDescription);
  const intro = description.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? fallbackDescription;

  return (
    <main className="envios-page section">
      <div className="container">
        <section className="envios-hero">
          <div>
            <p className="eyebrow">Agrovet Mar del Plata</p>
            <h1>Envíos en Mar del Plata</h1>
            <p>{intro}</p>
          </div>
        </section>

        <section className="envios-main">
          <div className="envios-checker">
            <DeliveryZoneChecker />
          </div>

          <div className="envios-card-grid">
            <article className="card envios-card">
              <span className="envios-icon"><Truck size={22} /></span>
              <div>
                <p className="eyebrow">Zona de reparto</p>
                <h2>Envío gratis</h2>
                <p>Disponible dentro de 3 km de Alberti 3213, con compra mínima desde $ 50.000.</p>
              </div>
            </article>
            <article className="card envios-card">
              <span className="envios-icon"><CreditCard size={22} /></span>
              <div>
                <p className="eyebrow">Pago online</p>
                <h2>Antes del reparto</h2>
                <p>Los pedidos online con envío se pagan online sí o sí antes de salir a reparto.</p>
              </div>
            </article>
            <article className="card envios-card">
              <span className="envios-icon"><Clock size={22} /></span>
              <div>
                <p className="eyebrow">Coordinación</p>
                <h2>Día de entrega</h2>
                <p>Después de realizar el pedido online, la veterinaria se contacta con vos para coordinar la entrega.</p>
              </div>
            </article>
            <article className="card envios-card">
              <span className="envios-icon"><Store size={22} /></span>
              <div>
                <p className="eyebrow">Fuera de zona</p>
                <h2>Retiro por sucursal</h2>
                <p>Si no podemos entregar, el pedido queda disponible para retiro en la sucursal más cercana.</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
