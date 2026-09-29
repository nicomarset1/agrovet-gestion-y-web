// Fotos de producto: el panel las guarda como data URL en products.image_url. Para que no viajen dentro
// del HTML ni se lean enteras de la base, los productos llegan con la ruta /api/product-image/[id] y una
// versión que cambia cuando cambia la foto (la ruta la cachea un año como inmutable).

// Hash FNV-1a de 32 bits: puro y sin dependencias, sirve igual en servidor y navegador.
function fnv1a(text: string, hash = 0x811c9dc5) {
  let value = hash;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function isDataImageUrl(imageUrl: string) {
  return /^data:image\//i.test(imageUrl.trim());
}

// Muestra corta de la foto: "largo:primeros 96:últimos 96". Las consultas de productos la arman igual
// en SQL (length/substr en SQLite, length/left/right en Postgres), así tienda y panel dan la misma URL.
export function productImageSample(imageUrl: string) {
  return `${imageUrl.length}:${imageUrl.slice(0, 96)}:${imageUrl.slice(-96)}`;
}

export function productImageSrc(product: { id: number; imageUrl?: string | null }) {
  const imageUrl = product.imageUrl?.trim() ?? "";
  if (!imageUrl) return "";
  // Los productos que vienen de la base ya traen la ruta armada.
  if (imageUrl.startsWith("/api/product-image/")) return imageUrl;
  if (isDataImageUrl(imageUrl)) return productImageSrcFromSample(product.id, productImageSample(imageUrl));
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return "";
}

// La base devuelve solo la muestra corta de la foto en lugar del data URL completo, y con eso se arma la
// ruta. La versión cambia si cambia la foto.
export function productImageSrcFromSample(id: number, sample: string) {
  if (!sample) return "";
  const first = fnv1a(sample);
  const second = fnv1a(sample, first);
  return `/api/product-image/${id}?v=${first.toString(36)}${second.toString(36)}`;
}
