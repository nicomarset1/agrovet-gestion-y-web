// URL canonica del sitio, usada para metadataBase, Open Graph, canonical y sitemap.
//
// Prioridad:
// 1. NEXT_PUBLIC_SITE_URL (definir con el dominio real, p.ej. https://www.agrovetmdp.com.ar)
// 2. VERCEL_PROJECT_PRODUCTION_URL (la setea Vercel automaticamente en produccion)
// 3. http://localhost:3000 (desarrollo)
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();
export const siteName = "Agrovet Mar del Plata";

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}
