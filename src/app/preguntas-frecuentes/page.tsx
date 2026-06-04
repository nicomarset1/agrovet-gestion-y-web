import Link from "next/link";
import { CreditCard, HelpCircle, MapPin, MessageCircle, PackageCheck, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { getBranches } from "@/lib/db";
import { getSpecialPageDescription } from "@/lib/special-page-content";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Preguntas frecuentes" };
export const dynamic = "force-dynamic";

const deliveryMinimumCents = 5000000;

export default async function PreguntasFrecuentesPage() {
  const [description, branches] = await Promise.all([
    getSpecialPageDescription("preguntas-frecuentes", "Resolvemos las dudas mas comunes sobre compras online, envios, retiro por sucursal, pagos y stock."),
    getBranches(),
  ]);
  const intro = description.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? "Resolvemos las dudas mas comunes sobre compras online, envios, retiro por sucursal, pagos y stock.";
  const branchList = branches.map((branch) => `${branch.name.replace("Sucursal ", "")}: ${branch.address}`).join(" / ");
  const faqs = [
    {
      icon: ShoppingCart,
      question: "Como hago un pedido online?",
      answer: "Elegis los productos en la tienda, los agregas al carrito y completas tus datos. Al confirmar el pedido queda reservado y Agrovet te contacta por WhatsApp para validar la compra.",
    },
    {
      icon: Truck,
      question: "Hacen envios en Mar del Plata?",
      answer: `Si. El envio gratis esta disponible para compras desde ${formatPrice(deliveryMinimumCents)}, dentro de la zona de reparto y hasta 3 km de Alberti 3213. En la pagina de envios podes ingresar calle y altura para verificarlo antes de finalizar.`,
    },
    {
      icon: CreditCard,
      question: "Como se pagan los pedidos con envio?",
      answer: "Los pedidos online con envio se pagan online si o si antes de salir a reparto. Despues de hacer el pedido, la veterinaria se contacta para coordinar el dia de entrega.",
    },
    {
      icon: PackageCheck,
      question: "Puedo retirar por sucursal?",
      answer: "Si. Podes elegir retiro por sucursal al finalizar el carrito. El pedido puede estar listo en aproximadamente 2 horas y queda reservado durante 3 dias habiles. Si necesitas mas tiempo, comunicate con el local.",
    },
    {
      icon: MapPin,
      question: "En que sucursales puedo retirar?",
      answer: branchList ? `Podes retirar segun stock disponible en: ${branchList}.` : "Podes retirar en las sucursales cargadas por Agrovet, segun stock disponible.",
    },
    {
      icon: ShieldCheck,
      question: "El stock y los precios estan actualizados?",
      answer: "La tienda muestra stock visible por sucursal y precios cargados desde el panel de gestion. Antes de entregar o retirar, Agrovet puede validar disponibilidad, precio final y cualquier detalle del pedido.",
    },
    {
      icon: MessageCircle,
      question: "Que pasa despues de confirmar un pedido?",
      answer: "Recibis un codigo de pedido y Agrovet continua la confirmacion por WhatsApp. Para retiro se confirma la sucursal y para envio se coordina la entrega.",
    },
    {
      icon: HelpCircle,
      question: "Puedo comprar medicamentos o productos de farmacia?",
      answer: "Si, pero los medicamentos y productos que lo requieran pueden necesitar asesoramiento veterinario antes de confirmar la venta.",
    },
  ];

  return (
    <main className="faq-page section">
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
            <p className="eyebrow">Atencion personalizada</p>
            <h2>Tenes otra consulta?</h2>
            <p>Escribinos por WhatsApp y te ayudamos con productos, stock, retiro, envio o asesoramiento veterinario.</p>
          </div>
          <Link className="button button-primary" href="https://wa.me/5492234251324" rel="noreferrer" target="_blank">WhatsApp</Link>
        </section>
      </div>
    </main>
  );
}
