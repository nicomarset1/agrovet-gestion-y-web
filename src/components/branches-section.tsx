import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Branch } from "@/lib/types";
import { DeliveryZoneChecker } from "./delivery-zone-checker";

export function BranchesSection({ branches }: { branches: Branch[] }) {
  return (
    <section className="section" id="locales">
      <div className="container">
        <div className="section-heading"><div><p className="eyebrow">Retiro y atención</p><h2 className="display">Nuestras sucursales</h2></div></div>
        <div className="branch-layout">
          <div>
            <div className="pickup-info card">
              <strong>Retiro en sucursal</strong>
              <p>En tan solo 2 horas tu pedido estará listo para retirar en la sucursal seleccionada. Los pedidos permanecen en sucursal durante 3 días hábiles; si necesitás más tiempo, comunicate con nosotros.</p>
            </div>
            <div className="categories branch-grid">
              {branches.map((branch) => (
                <Link
                  className="card category branch-card"
                  href={branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.address} Mar del Plata`)}`}
                  key={branch.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="category-icon"><MapPin size={23} /></span>
                  <strong>{branch.name}</strong>
                  <small>{branch.address}</small>
                  <span className="product-link">Cómo llegar</span>
                  {!branch.verified && <span className="stock-label out">Datos pendientes de confirmación</span>}
                </Link>
              ))}
            </div>
          </div>
          <DeliveryZoneChecker />
        </div>
      </div>
    </section>
  );
}
