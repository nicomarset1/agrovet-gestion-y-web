import Link from "next/link";
import { getBranches } from "@/lib/db";

export async function Footer() {
  const branches = await getBranches();
  return (
    <footer className="footer" id="sucursales">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand">
              <span className="brand-mark">A</span>
              <span className="brand-title">Agrovet<span className="brand-subtitle">Mar del Plata</span></span>
            </div>
            <p className="footer-brand-copy">Alimentos, accesorios y farmacia para perros y gatos. Atención personalizada con respaldo profesional.</p>
          </div>
          <div>
            <h3>Comprar</h3>
            <div className="footer-links">
              <Link href="/tienda?category=alimentos">Alimentos</Link>
              <Link href="/tienda?category=accesorios">Accesorios</Link>
              <Link href="/tienda?category=farmacia">Farmacia</Link>
              <Link href="/admin">Administración</Link>
            </div>
          </div>
          <div>
            <h3>Sucursales</h3>
            {branches.map((branch) => (
              <p key={branch.id}>
                <strong>{branch.name}</strong><br />
                {branch.address}<br />
                <Link href={`tel:${branch.phone.replace(/\D/g, "")}`}>Llamar: {branch.phone}</Link>
              </p>
            ))}
          </div>
          <div>
            <h3>Seguinos</h3>
            <div className="footer-links">
              <Link href="https://www.instagram.com/agrovetmdp/" rel="noreferrer" target="_blank">Instagram</Link>
              <Link href="https://www.facebook.com/search/top?q=agrovet%20mar%20del%20plata" rel="noreferrer" target="_blank">Facebook</Link>
              <Link href="https://wa.me/542234935665" rel="noreferrer" target="_blank">WhatsApp</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">© 2026 Agrovet Mar del Plata. Sitio creado por Nicolás Marset.</div>
      </div>
    </footer>
  );
}
