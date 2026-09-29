import Link from "next/link";
import { Home, PawPrint, ShoppingBag } from "lucide-react";

export const metadata = {
  title: "Página no encontrada | Agrovet",
};

export default function NotFound() {
  return (
    <section className="state-page">
      <div className="container">
        <div className="state-card">
          <div className="state-visual" aria-hidden="true">
            <span className="state-code display">404</span>
            <span className="state-paws">
              <PawPrint size={22} />
              <PawPrint size={18} />
              <PawPrint size={14} />
            </span>
          </div>
          <p className="eyebrow">Página no encontrada</p>
          <h1 className="display">Esta página se nos escapó</h1>
          <p className="state-copy">
            La dirección que buscaste no existe, fue movida o está escrita con otro
            enlace. Podés volver al inicio o seguir en la tienda.
          </p>
          <div className="state-actions">
            <Link className="button button-primary" href="/tienda">
              <ShoppingBag size={17} />
              Ir a la tienda
            </Link>
            <Link className="button button-light" href="/">
              <Home size={17} />
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
