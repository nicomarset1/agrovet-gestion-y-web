import { SpecialPageShell } from "@/components/special-page-shell";
import { getSpecialPageDescription } from "@/lib/special-page-content";

export const metadata = { title: "Servicios" };
export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  return (
    <SpecialPageShell
      description={await getSpecialPageDescription("servicios", "Pronto vamos a cargar los servicios disponibles y como solicitarlos.")}
      title="Servicios"
    />
  );
}
