import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CartProvider } from "@/components/cart-provider";
import { LiveSync } from "@/components/live-sync";
import { ToastProvider } from "@/components/toast-provider";
import { WhatsappFloat } from "@/components/whatsapp-float";
import { getSyncVersion } from "@/lib/db";
import { absoluteUrl, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const description = "Tienda online de Agrovet Mar del Plata. Alimentos, accesorios y farmacia para perros y gatos con stock por sucursal.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Agrovet | Alimentos y cuidado para perros y gatos",
    template: "%s | Agrovet",
  },
  description,
  applicationName: siteName,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/agrovet-logo.jpg",
    apple: "/agrovet-logo.jpg",
  },
  openGraph: {
    type: "website",
    siteName,
    locale: "es_AR",
    url: siteUrl,
    title: "Agrovet | Alimentos y cuidado para perros y gatos",
    description,
    images: [absoluteUrl("/agrovet-logo.jpg")],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agrovet | Alimentos y cuidado para perros y gatos",
    description,
  },
};

export const viewport = {
  themeColor: "#5b0f73",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "PetStore",
  name: siteName,
  description,
  url: siteUrl,
  image: absoluteUrl("/agrovet-logo.jpg"),
  areaServed: "Mar del Plata, Buenos Aires, Argentina",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Mar del Plata",
    addressRegion: "Buenos Aires",
    addressCountry: "AR",
  },
  sameAs: [
    "https://www.instagram.com/agrovetmdp/",
    "https://www.facebook.com/search/top?q=agrovet%20mar%20del%20plata",
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const syncVersion = await getSyncVersion();
  return (
    <html data-scroll-behavior="smooth" lang="es" className={`${manrope.variable} ${fraunces.variable} antialiased`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
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
