import { SpecialPageShell } from "@/components/special-page-shell";

export const metadata = { title: "Preguntas frecuentes", robots: { index: false, follow: true } };

export default function PreguntasFrecuentesPage() {
  return (
    <SpecialPageShell
      description="Pronto vamos a ordenar las dudas frecuentes sobre compras, envios, pagos y retiro."
      title="Preguntas frecuentes"
    />
  );
}
