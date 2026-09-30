import type { Metadata } from "next";

// El panel no se indexa. El layout raíz ya no le muestra header ni footer de la tienda (StoreChrome).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
