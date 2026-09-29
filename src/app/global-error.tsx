"use client";

import { useEffect } from "react";

// Reemplaza al layout raíz cuando falla (por ejemplo el header al leer la base),
// así que no cuenta con globals.css ni con las fuentes: lleva sus propios estilos.
const styles = `
  .ge-body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: radial-gradient(circle at 50% 0%, #f3e8ff, #ffffff 60%); color: #1f1515;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .ge-card { width: min(100%, 520px); box-sizing: border-box; padding: 40px 28px; text-align: center;
    background: #fff; border: 1px solid #e3d5f3; border-radius: 20px;
    box-shadow: 0 10px 26px rgba(91, 15, 115, .11); animation: ge-in .38s cubic-bezier(.22, .78, .22, 1) both; }
  .ge-mark { width: 60px; height: 60px; margin: 0 auto 20px; border-radius: 16px;
    background: #5b0f73 url("/brand/agrovet-mark-144.png") center / cover no-repeat; box-shadow: 0 8px 18px rgba(91, 15, 115, .18); }
  .ge-eyebrow { margin: 0; color: #7c3aed; font-size: 12px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
  .ge-title { margin: 10px 0 12px; font-size: clamp(26px, 5vw, 34px); line-height: 1.12; text-wrap: balance; }
  .ge-copy { margin: 0 auto; max-width: 420px; color: #6c5a7d; line-height: 1.6; text-wrap: pretty; }
  .ge-actions { margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .ge-button { min-height: 48px; padding: 0 22px; border-radius: 999px; font: inherit; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer; text-decoration: none;
    transition: transform .14s ease, background .14s ease; }
  .ge-button:active { transform: scale(.96); }
  .ge-button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(124, 58, 237, .32); }
  .ge-primary { border: 0; background: #5b0f73; color: #fff; }
  .ge-primary:hover { background: #7c3aed; }
  .ge-light { border: 1px solid #e3d5f3; background: #fff; color: #5b0f73; }
  .ge-light:hover { background: #f5ebff; }
  @media (max-width: 480px) { .ge-actions { display: grid; } .ge-button { width: 100%; } }
  @keyframes ge-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ge-card { animation: none; } }
`;

export default function GlobalError({
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
    <html lang="es">
      <body className="ge-body">
        <title>Algo salió mal | Agrovet</title>
        <style>{styles}</style>
        <main className="ge-card" role="alert">
          <div className="ge-mark" aria-hidden="true" />
          <p className="ge-eyebrow">Algo salió mal</p>
          <h1 className="ge-title">No pudimos cargar la tienda</h1>
          <p className="ge-copy">
            Puede ser un problema momentáneo. Probá de nuevo en unos segundos; si sigue pasando,
            escribinos por WhatsApp y te ayudamos.
          </p>
          <div className="ge-actions">
            <button className="ge-button ge-primary" onClick={() => unstable_retry()} type="button">
              Reintentar
            </button>
            {/* Recarga completa a propósito: el layout raíz falló y hay que volver a pedirlo entero. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="ge-button ge-light" href="/">Ir al inicio</a>
          </div>
        </main>
      </body>
    </html>
  );
}
