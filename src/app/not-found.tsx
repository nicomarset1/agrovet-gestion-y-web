import Link from "next/link";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";

export const metadata = {
  title: "Página no encontrada | Agrovet",
};

export default function NotFound() {
  return (
    <main className="hero">
      <div className="container">
        <section className="hero-box" style={{ minHeight: 420 }}>
          <div className="hero-content" style={{ maxWidth: 660 }}>
            <p className="eyebrow">Página no encontrada</p>
            <h1>404</h1>
            <p>
              La dirección que buscaste no existe, fue movida o está escrita con otro
              enlace. Podés volver al inicio o seguir en la tienda.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/">
                <Home size={16} />
                Ir al inicio
              </Link>
              <Link className="button button-light" href="/tienda">
                <ArrowLeft size={16} />
                Volver a la tienda
              </Link>
            </div>
          </div>
          <div className="hero-shape" aria-hidden="true" style={{ background: "#f2cac4", opacity: 0.95 }} />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "clamp(16px, 6vw, 70px)",
              top: "50%",
              transform: "translateY(-50%)",
              width: "min(36vw, 320px)",
              aspectRatio: "1",
              borderRadius: "50%",
              background: "radial-gradient(circle at 30% 30%, rgba(200, 22, 31, .18), rgba(200, 22, 31, .03) 58%, transparent 59%)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AlertTriangle size={88} strokeWidth={1.7} color="#c8161f" />
          </div>
        </section>
      </div>
    </main>
  );
}
