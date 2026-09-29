import type { Metadata } from "next";
import { absoluteUrl, siteName } from "./site";

// Metadata de una página informativa: canonical propio y Open Graph/Twitter con su título y descripción.
// Open Graph de la página reemplaza al del layout, por eso se repiten la imagen y los datos del sitio.
export function infoPageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const fullTitle = `${title} | Agrovet`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName,
      locale: "es_AR",
      url: path,
      title: fullTitle,
      description,
      images: [absoluteUrl("/agrovet-logo.png")],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}
