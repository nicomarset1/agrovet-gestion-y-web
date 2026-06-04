import Link from "next/link";
import { AtSign, Clock, MapPin, MessageCircle, Phone, Share2, Store } from "lucide-react";
import { getBranches } from "@/lib/db";
import { getSpecialPageDescription } from "@/lib/special-page-content";

export const metadata = { title: "Contacto" };
export const dynamic = "force-dynamic";

export default async function ContactoPage() {
  const [description, branches] = await Promise.all([
    getSpecialPageDescription("contacto", "Comunicate con Agrovet Mar del Plata por pedidos, stock, retiro en sucursal o envíos."),
    getBranches(),
  ]);
  const intro = description.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? "Comunicate con Agrovet Mar del Plata por pedidos, stock, retiro en sucursal o envíos.";

  return (
    <main className="contact-page section">
      <div className="container">
        <section className="contact-hero">
          <div>
            <p className="eyebrow">Agrovet Mar del Plata</p>
            <h1>Contacto</h1>
            <p>{intro}</p>
          </div>
          <div className="contact-hero-actions">
            <Link className="button button-primary" href="https://wa.me/5492234251324" rel="noreferrer" target="_blank">
              <MessageCircle size={18} />
              WhatsApp
            </Link>
            <Link className="button button-light" href="/tienda">Ver tienda</Link>
          </div>
        </section>

        <section className="contact-grid" aria-label="Canales de contacto">
          <article className="card contact-channel">
            <span className="contact-icon"><MessageCircle size={22} /></span>
            <div>
              <p className="eyebrow">Canal principal</p>
              <h2>WhatsApp</h2>
              <p>Escribinos para consultar stock, pedidos online, retiro por sucursal o zona de envío.</p>
              <Link className="product-link" href="https://wa.me/5492234251324" rel="noreferrer" target="_blank">Enviar mensaje</Link>
            </div>
          </article>

          <article className="card contact-channel">
            <span className="contact-icon"><Clock size={22} /></span>
            <div>
              <p className="eyebrow">Pedidos online</p>
              <h2>Confirmación</h2>
              <p>Después de hacer un pedido, Agrovet se contacta para validar pago, disponibilidad, retiro o entrega.</p>
              <Link className="product-link" href="/preguntas-frecuentes">Ver preguntas frecuentes</Link>
            </div>
          </article>

          <article className="card contact-channel">
            <span className="contact-icon"><Share2 size={22} /></span>
            <div>
              <p className="eyebrow">Redes</p>
              <h2>Instagram y Facebook</h2>
              <p>También podés seguir novedades, productos y publicaciones de Agrovet en redes sociales.</p>
              <div className="contact-socials">
                <Link href="https://www.instagram.com/agrovet_tienda/" rel="noreferrer" target="_blank"><AtSign size={16} /> Instagram</Link>
                <span className="contact-social-disabled"><Share2 size={16} /> Facebook</span>
              </div>
            </div>
          </article>
        </section>

        <section className="contact-branches">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sucursales</p>
              <h2>Locales de atención</h2>
            </div>
          </div>

          <div className="contact-branch-grid">
            {branches.map((branch) => {
              const mapHref = branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.address} Mar del Plata`)}`;
              return (
                <article className="card contact-branch-card" key={branch.id}>
                  <span className="contact-icon"><Store size={22} /></span>
                  <div>
                    <h3>{branch.name}</h3>
                    <p><MapPin size={16} /> {branch.address}</p>
                    <p><Phone size={16} /> {branch.phone}</p>
                    <div className="contact-branch-actions">
                      <Link className="button button-light" href={`tel:${branch.phone.replace(/\D/g, "")}`}>Llamar</Link>
                      <Link className="button button-light" href={mapHref} rel="noreferrer" target="_blank">Cómo llegar</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
