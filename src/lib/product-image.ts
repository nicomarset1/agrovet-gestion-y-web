// Fotos de producto: el panel las guarda como data URL en products.image_url. Para que no viajen dentro
// del HTML, las páginas usan productImageSrc(), que apunta a /api/product-image/[id] con una versión
// que cambia cuando cambia la foto (la ruta la cachea un año como inmutable).

// Hash FNV-1a de 32 bits: puro y sin dependencias, sirve igual en servidor y navegador.
function fnv1a(text: string, hash = 0x811c9dc5) {
  let value = hash;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

// Versión barata y estable del contenido: primeros y últimos 2 KB, 16 muestras del medio y el largo.
function versionSample(imageUrl: string) {
  if (imageUrl.length <= 12_288) return imageUrl;
  const parts = [imageUrl.slice(0, 2048), imageUrl.slice(-2048)];
  const step = Math.floor((imageUrl.length - 4096) / 17);
  for (let index = 1; index <= 16; index++) parts.push(imageUrl.slice(2048 + step * index, 2048 + step * index + 256));
  return parts.join("");
}

export function productImageVersion(imageUrl: string) {
  const sample = versionSample(imageUrl);
  const first = fnv1a(sample);
  const second = fnv1a(String(imageUrl.length), first);
  return `${first.toString(36)}${second.toString(36)}`;
}

export function isDataImageUrl(imageUrl: string) {
  return /^data:image\//i.test(imageUrl.trim());
}

export function productImageSrc(product: { id: number; imageUrl?: string | null }) {
  const imageUrl = product.imageUrl?.trim() ?? "";
  if (!imageUrl) return "";
  if (isDataImageUrl(imageUrl)) return `/api/product-image/${product.id}?v=${productImageVersion(imageUrl)}`;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return "";
}
