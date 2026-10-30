/*
 * Tamaño de envase de una presentación, para el filtro "Presentación" de la tienda.
 * Las etiquetas mezclan sabor o variante con el tamaño ("Weight Care 85 g", "Lata 340 g", "15 kg + 3 kg"):
 * el filtro ofrece solo el tamaño ("85 g", "340 g", "15 kg") y compara por igualdad, así "5 kg" no trae "15 kg".
 * Quedan afuera los rangos de peso del animal ("2 a 4,5 kg", de las pipetas), los packs ("3 x 100 g")
 * y lo que no tiene peso ni volumen (talles, unidades).
 */

export type PackageKind = "kg" | "g" | "ml";
export type PackageSize = { key: string; kind: PackageKind; base: number };

const unitOf: Record<string, { kind: PackageKind; unit: string; factor: number }> = {
  kg: { kind: "kg", unit: "kg", factor: 1000 },
  kgs: { kind: "kg", unit: "kg", factor: 1000 },
  g: { kind: "g", unit: "g", factor: 1 },
  gr: { kind: "g", unit: "g", factor: 1 },
  grs: { kind: "g", unit: "g", factor: 1 },
  ml: { kind: "ml", unit: "ml", factor: 1 },
  cc: { kind: "ml", unit: "ml", factor: 1 },
  l: { kind: "ml", unit: "l", factor: 1000 },
  lt: { kind: "ml", unit: "l", factor: 1000 },
  lts: { kind: "ml", unit: "l", factor: 1000 },
};

const amount = String.raw`\d+(?:[.,]\d+)?`;
const range = new RegExp(String.raw`${amount}\s*(?:kg|g)?\s+a\s+${amount}`, "i");
const pack = new RegExp(String.raw`\d+\s*x\s*${amount}`, "i");
// "12+3 kg" es una bolsa de 12 kg con 3 de regalo: el tamaño es el primero. Solo en kg: "Ageing 12+ 85 g" es una edad.
const bonus = new RegExp(String.raw`(${amount})\s*(?:kgs?)?\s*\+\s*${amount}\s*(kgs?)\b`, "i");
const size = new RegExp(String.raw`(${amount})\s*(kgs?|grs?|g|ml|cc|lts?|l)(?![a-záéíóúñ])`, "i");

export function packageSize(label: string): PackageSize | null {
  const text = label.trim();
  if (!text || range.test(text) || pack.test(text)) return null;
  const match = text.match(bonus) ?? text.match(size);
  if (!match) return null;
  const info = unitOf[match[2].toLowerCase()];
  const value = Number(match[1].replace(",", "."));
  if (!info || !Number.isFinite(value) || value <= 0) return null;
  const shown = String(value).replace(".", ",");
  return { key: `${shown} ${info.unit}`, kind: info.kind, base: value * info.factor };
}

/** Si lo elegido es un tamaño, compara por tamaño; si no (links viejos), busca el texto dentro de la etiqueta. */
export function presentationMatches(variantLabel: string, chosen: string) {
  const wanted = packageSize(chosen);
  if (wanted) return packageSize(variantLabel)?.key === wanted.key;
  return variantLabel.toLowerCase().includes(chosen.toLowerCase());
}

export const packageKindLabel: Record<PackageKind, string> = {
  kg: "Bolsas",
  g: "Latas, pouches y sobres",
  ml: "Líquidos",
};
