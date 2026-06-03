import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CartProvider } from "@/components/cart-provider";
import { LiveSync } from "@/components/live-sync";
import { ToastProvider } from "@/components/toast-provider";
import { WhatsappFloat } from "@/components/whatsapp-float";
import { getSyncVersion } from "@/lib/db";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Agrovet | Alimentos y cuidado para perros y gatos",
    template: "%s | Agrovet",
  },
  description: "Tienda online de Agrovet Mar del Plata. Alimentos, accesorios y farmacia para perros y gatos con stock por sucursal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const syncVersion = getSyncVersion();
  return (
    <html data-scroll-behavior="smooth" lang="es" className={`${manrope.variable} ${fraunces.variable} antialiased`}>
      <body>
        <ToastProvider>
          <CartProvider>
            <LiveSync initialVersion={syncVersion} />
            <Header />
            <main>{children}</main>
            <Footer />
            <WhatsappFloat />
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
