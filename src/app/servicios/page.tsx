import { SpecialPageShell } from "@/components/special-page-shell";

export const metadata = { title: "Servicios", robots: { index: false, follow: true } };

export default function ServiciosPage() {
  return (
    <SpecialPageShell
      description="Pronto vamos a cargar los servicios disponibles y como solicitarlos."
      title="Servicios"
    />
  );
}
