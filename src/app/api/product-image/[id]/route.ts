import { getProductImage, getProductImageIndex } from "@/lib/db";

// Tipos que se sirven desde un data URL. SVG queda afuera: puede traer scripts.
const allowedTypes = new Set(["image/webp", "image/jpeg", "image/png", "image/gif", "image/avif"]);

function notFound(status = 404) {
  return new Response(null, { status, headers: { "cache-control": "public, max-age=60" } });
}

function decodeDataUrl(imageUrl: string) {
  const match = /^data:([^;,]+)((?:;[^;,]*)*),([\s\S]*)$/.exec(imageUrl.trim());
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!allowedTypes.has(contentType)) return null;
  const isBase64 = /;base64/i.test(match[2]);
  const body = isBase64 ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return body.length ? { contentType, body } : null;
}

// La ruta es pública y la caché del CDN distingue por URL: cualquier parámetro inventado la evitaría y haría leer
// una foto entera de la base por pedido. Por eso se decide con el índice cacheado, que no lee fotos: la foto solo
// se lee para la URL canónica (la que usa la tienda, con su versión) o para la URL sin parámetros.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  if (!/^\d{1,9}$/.test(rawId)) return notFound(400);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return notFound(400);

  const canonical = (await getProductImageIndex())[id];
  if (!canonical) return notFound();

  if (/^https?:\/\//i.test(canonical)) {
    return new Response(null, { status: 302, headers: { location: canonical, "cache-control": "public, max-age=3600" } });
  }

  const search = new URL(request.url).search;
  const canonicalSearch = canonical.slice(canonical.indexOf("?"));
  const versioned = search === canonicalSearch;
  if (search && !versioned) {
    // Temporal y de vida corta: cuando cambia la foto, la URL canónica cambia.
    return new Response(null, { status: 302, headers: { location: canonical, "cache-control": "public, max-age=60" } });
  }

  // Con versión la foto no cambia nunca bajo esa URL. Sin versión puede cambiar: caché corta y sin inmutable.
  const headers = {
    "cache-control": versioned ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, max-age=3600",
    etag: `"${canonicalSearch.slice("?v=".length)}"`,
    "x-content-type-options": "nosniff",
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((value) => value.trim() === headers.etag || value.trim() === `W/${headers.etag}`)) {
    return new Response(null, { status: 304, headers });
  }

  const image = await getProductImage(id);
  const decoded = image ? decodeDataUrl(image.imageUrl) : null;
  if (!decoded) return notFound();
  return new Response(new Uint8Array(decoded.body), {
    status: 200,
    headers: { ...headers, "content-type": decoded.contentType, "content-length": String(decoded.body.length) },
  });
}
