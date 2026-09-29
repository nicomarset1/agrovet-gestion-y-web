import { createHash } from "node:crypto";
import { getProductImage } from "@/lib/db";

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  if (!/^\d{1,9}$/.test(rawId)) return notFound(400);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return notFound(400);

  const image = await getProductImage(id);
  if (!image) return notFound();
  const imageUrl = image.imageUrl.trim();

  if (/^https?:\/\//i.test(imageUrl)) {
    return new Response(null, { status: 302, headers: { location: imageUrl, "cache-control": "public, max-age=3600" } });
  }

  const decoded = decodeDataUrl(imageUrl);
  if (!decoded) return notFound();

  const etag = `"${createHash("sha1").update(imageUrl).digest("base64url")}"`;
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    etag,
    "x-content-type-options": "nosniff",
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((value) => value.trim() === etag || value.trim() === `W/${etag}`)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(decoded.body), {
    status: 200,
    headers: { ...headers, "content-type": decoded.contentType, "content-length": String(decoded.body.length) },
  });
}
