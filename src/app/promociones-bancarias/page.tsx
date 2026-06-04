import { SpecialPageShell } from "@/components/special-page-shell";

export const metadata = { title: "Promociones bancarias", robots: { index: false, follow: true } };

export default function PromocionesBancariasPage() {
  return (
    <SpecialPageShell
      description="Pronto vamos a cargar las promociones, cuotas y beneficios bancarios disponibles."
      title="Promociones bancarias"
    />
  );
}
