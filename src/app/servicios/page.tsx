import { SpecialPageShell } from "@/components/special-page-shell";
import { infoPageMetadata } from "@/lib/page-metadata";
import { getSpecialPageDescription } from "@/lib/special-page-content";

export const metadata = infoPageMetadata({
  title: "Servicios",
  path: "/servicios",
  description: "Servicios de Agrovet Mar del Plata para el cuidado de perros y gatos y cómo solicitarlos.",
});
export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  return (
    <SpecialPageShell
      description={await getSpecialPageDescription("servicios", "Pronto vamos a cargar los servicios disponibles y cómo solicitarlos.")}
      title="Servicios"
    />
  );
}
