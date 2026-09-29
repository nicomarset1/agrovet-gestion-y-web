"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCw } from "lucide-react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Queda en la consola del navegador para diagnóstico; al cliente no se le muestra.
    console.error(error);
  }, [error]);

  return (
    <section className="state-page">
      <div className="container">
        <div className="state-card" role="alert">
          <div className="state-visual state-visual-error" aria-hidden="true">
            <span className="state-icon"><RotateCw size={40} strokeWidth={1.8} /></span>
          </div>
          <p className="eyebrow">Algo salió mal</p>
          <h1 className="display">No pudimos cargar esta página</h1>
          <p className="state-copy">
            Puede ser un problema momentáneo. Probá de nuevo en unos segundos; si sigue pasando,
            escribinos por WhatsApp y te ayudamos.
          </p>
          <div className="state-actions">
            <button className="button button-primary" onClick={() => unstable_retry()} type="button">
              <RotateCw size={17} />
              Reintentar
            </button>
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
