import Link from "next/link";
import { infoPageMetadata } from "@/lib/page-metadata";
import { CreditCard, HelpCircle, MapPin, MessageCircle, PackageCheck, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { getBranches } from "@/lib/db";
import { getSpecialPageDescription } from "@/lib/special-page-content";
import { formatPrice } from "@/lib/format";

export const metadata = infoPageMetadata({
  title: "Preguntas frecuentes",
  path: "/preguntas-frecuentes",
  description: "Respuestas sobre cómo comprar en Agrovet: pedidos online, envíos en Mar del Plata, retiro por sucursal, pagos, stock y medicamentos.",
});
export const dynamic = "force-dynamic";

const deliveryMinimumCents = 5000000;

export default async function PreguntasFrecuentesPage() {
  const [description, branches] = await Promise.all([
    getSpecialPageDescription("preguntas-frecuentes", "Resolvemos las dudas más comunes sobre compras online, envíos, retiro por sucursal, pagos y stock."),
    getBranches(),
  ]);
  const intro = description.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? "Resolvemos las dudas más comunes sobre compras online, envíos, retiro por sucursal, pagos y stock.";
  const branchList = branches.map((branch) => `${branch.name.replace("Sucursal ", "")}: ${branch.address}`).join(" / ");
  const faqs = [
    {
      icon: ShoppingCart,
      question: "¿Cómo hago un pedido online?",
      answer: "Elegís los productos en la tienda, los agregás al carrito y completás tus datos. Al confirmar el pedido queda reservado y Agrovet te contacta por WhatsApp para validar la compra.",
    },
    {
      icon: Truck,
      question: "¿Hacen envíos en Mar del Plata?",
      answer: `Sí. El envío gratis está disponible para compras desde ${formatPrice(deliveryMinimumCents)}, dentro de la zona de reparto y hasta 3 km de la sucursal de Av. Independencia y Alberti. En la página de envíos podés ingresar calle y altura para verificarlo antes de finalizar.`,
    },
    {
      icon: CreditCard,
      question: "¿Cómo se pagan los pedidos con envío?",
      answer: "Los pedidos online con envío se pagan online sí o sí antes de salir a reparto. Después de hacer el pedido, la veterinaria se contacta para coordinar el día de entrega.",
    },
    {
      icon: PackageCheck,
      question: "¿Puedo retirar por sucursal?",
      answer: "Sí. Podés elegir retiro por sucursal al finalizar el carrito. El pedido puede estar listo en aproximadamente 2 horas y queda reservado durante 3 días hábiles. Si necesitás más tiempo, comunicate con el local.",
    },
    {
      icon: MapPin,
      question: "¿En qué sucursales puedo retirar?",
      answer: branchList ? `Podés retirar según stock disponible en: ${branchList}.` : "Podés retirar en las sucursales cargadas por Agrovet, según stock disponible.",
    },
    {
      icon: ShieldCheck,
      question: "¿El stock y los precios están actualizados?",
      answer: "La tienda muestra stock visible por sucursal y precios cargados desde el panel de gestión. Antes de entregar o retirar, Agrovet puede validar disponibilidad, precio final y cualquier detalle del pedido.",
    },
    {
      icon: MessageCircle,
      question: "¿Qué pasa después de confirmar un pedido?",
      answer: "Recibís un código de pedido y Agrovet continúa la confirmación por WhatsApp. Para retiro se confirma la sucursal y para envío se coordina la entrega.",
    },
    {
      icon: HelpCircle,
      question: "¿Puedo comprar medicamentos o productos de farmacia?",
      answer: "Sí, pero los medicamentos y productos que lo requieran pueden necesitar asesoramiento veterinario antes de confirmar la venta.",
    },
  ];

  return (
    <div className="faq-page section">
      <div className="container">
        <div className="section-heading faq-heading">
          <div>
            <p className="eyebrow">Agrovet Mar del Plata</p>
            <h1>Preguntas frecuentes</h1>
            <p>{intro}</p>
          </div>
          <Link className="button button-light" href="/tienda">Ver tienda</Link>
        </div>

        <section className="faq-grid" aria-label="Preguntas frecuentes">
          {faqs.map((faq) => {
            const Icon = faq.icon;
            return (
              <article className="card faq-card" key={faq.question}>
                <span className="faq-icon"><Icon size={21} /></span>
                <div>
                  <h2>{faq.question}</h2>
                  <p>{faq.answer}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="faq-contact card">
          <div>
            <p className="eyebrow">Atención personalizada</p>
            <h2>¿Tenés otra consulta?</h2>
            <p>Escribinos por WhatsApp y te ayudamos con productos, stock, retiro, envío o asesoramiento veterinario.</p>
          </div>
          <Link className="button button-primary" href="https://wa.me/5492234251324" rel="noreferrer" target="_blank">WhatsApp</Link>
        </section>
      </div>
    </div>
  );
}
