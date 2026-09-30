// Detecta en el cliente si la ruta actual es el panel de gestión sin escribir su nombre: estos
// componentes (cromo de la tienda, WhatsApp, live-sync) se descargan en todas las páginas públicas.
// Se compara el hash del primer segmento de la ruta.
const panelSegmentHash = "1ml5z7f";

// Hash FNV-1a de 32 bits.
function fnv1a(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function isPanelPath(pathname: string | null | undefined) {
  const segment = pathname?.split("/")[1] ?? "";
  return Boolean(segment) && fnv1a(segment).toString(36) === panelSegmentHash;
}
