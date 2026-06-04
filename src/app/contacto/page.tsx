import { SpecialPageShell } from "@/components/special-page-shell";

export const metadata = { title: "Contacto", robots: { index: false, follow: true } };

export default function ContactoPage() {
  return (
    <SpecialPageShell
      description="Pronto vamos a cargar los canales de contacto y la informacion de cada sucursal."
      title="Contacto"
    />
  );
}
