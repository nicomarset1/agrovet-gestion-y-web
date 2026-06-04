import { SpecialPageShell } from "@/components/special-page-shell";

export const metadata = { title: "Envíos", robots: { index: false, follow: true } };

export default function EnviosPage() {
  return (
    <SpecialPageShell
      description="Pronto vamos a detallar zonas, tiempos, condiciones y costos de envío."
      title="Envíos"
    />
  );
}
