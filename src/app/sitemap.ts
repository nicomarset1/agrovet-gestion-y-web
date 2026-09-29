import type { MetadataRoute } from "next";
import { getCatalogFacets, getSearchIndex } from "@/lib/db";
import { siteUrl } from "@/lib/site";

// Páginas informativas públicas. /carrito, /admin y /api quedan afuera a propósito.
const infoPages = ["/envios", "/contacto", "/preguntas-frecuentes", "/promociones-bancarias", "/servicios"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // getSearchIndex solo devuelve datos de texto (sin fotos) de los productos activos, no archivados ni purgados.
  const [products, facets] = await Promise.all([getSearchIndex(), getCatalogFacets()]);
  // La base no guarda fecha de modificación por producto: home y tienda cambian con el stock todos los días,
  // así que llevan la fecha actual; al resto no se le inventa una fecha.
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/tienda`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  // Mismo formato que el canonical de cada categoría en /tienda (?category=slug), solo las que tienen productos.
  for (const category of facets.categories) {
    routes.push({
      url: `${siteUrl}/tienda?category=${encodeURIComponent(category.slug)}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  for (const product of products) {
    routes.push({
      url: `${siteUrl}/producto/${product.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const path of infoPages) {
    routes.push({ url: `${siteUrl}${path}`, changeFrequency: "monthly", priority: 0.5 });
  }

  return routes;
}
