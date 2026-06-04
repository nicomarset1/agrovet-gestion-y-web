import type { MetadataRoute } from "next";
import { getSearchIndex } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getSearchIndex();
  const routes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/tienda`, changeFrequency: "daily", priority: 0.9 },
  ];
  for (const product of products) {
    routes.push({
      url: `${siteUrl}/producto/${product.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  return routes;
}
