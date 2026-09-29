import type { SearchIndexItem } from "@/lib/types";

/*
 * Motor del buscador del header. Trabaja sobre el índice que ya llega del servidor
 * (getSearchIndex) y resuelve del lado del cliente lo que un "includes" no resolvía:
 * varias palabras en cualquier orden, tildes y mayúsculas, plurales, nombres en inglés
 * ("cachorro" encuentra "Puppy"), marcas escritas juntas ("proplan") y errores de tipeo.
 */

export type SearchHit = { product: SearchIndexItem; score: number };
export type SearchResult = {
  hits: SearchHit[];
  total: number;
  /** Término corregido cuando hubo un error de tipeo ("eukanuva" → "eukanuba"). */
  correctedQuery: string | null;
  /** Especie si la búsqueda es solo "perro(s)" o "gato(s)". */
  species: "perro" | "gato" | null;
};

type IndexedProduct = {
  product: SearchIndexItem;
  nameTokens: string[];
  brandTokens: string[];
  otherTokens: string[];
  compact: string;
  fullName: string;
};

export type PreparedIndex = { items: IndexedProduct[]; vocabulary: string[] };

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "15 kg", "7,5 kg" y "500 g" quedan como un solo término: 15kg, 7.5kg, 500g.
    .replace(/(\d)[,.](\d)/g, "$1.$2")
    .replace(/(\d)\s+(kg|g|gr|ml|l|lt|cc)\b/g, "$1$2")
    .replace(/[^a-z0-9.+]+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

/** Singular aproximado: perros → perro, sabores → sabor, gatos → gato. */
function stem(token: string) {
  if (token.length > 4 && /[rlndz]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

// Equivalencias español / inglés: los nombres del catálogo mezclan los dos idiomas.
const SYNONYMS: Record<string, string[]> = {
  perro: ["perro", "dog", "canine", "canino"],
  gato: ["gato", "cat", "feline", "felino"],
  cachorro: ["cachorro", "puppy", "junior"],
  gatito: ["gatito", "kitten"],
  adulto: ["adulto", "adult"],
  senior: ["senior", "mature", "ageing", "aging"],
  mayor: ["mayor", "senior", "mature", "ageing"],
  pequeno: ["pequeno", "small", "mini"],
  chico: ["chico", "small", "mini", "pequeno"],
  mediano: ["mediano", "medium"],
  grande: ["grande", "large", "maxi", "giant"],
  castrado: ["castrado", "esterilizado", "sterilised", "sterilized"],
  esterilizado: ["esterilizado", "castrado", "sterilised", "sterilized"],
  hipoalergenico: ["hipoalergenico", "hypoallergenic", "anallergenic"],
  renal: ["renal", "kidney"],
  urinario: ["urinario", "urinary"],
  piel: ["piel", "skin", "derma"],
  sobre: ["sobre", "pouch"],
  lata: ["lata", "can"],
  humedo: ["humedo", "pouch", "lata"],
};

const SPECIES_WORDS: Record<string, "perro" | "gato"> = {
  perro: "perro", perra: "perro", canino: "perro", dog: "perro",
  gato: "gato", gata: "gato", felino: "gato", cat: "gato",
};

function speciesTokens(species: SearchIndexItem["species"]) {
  if (species === "perro") return ["perro", "canino"];
  if (species === "gato") return ["gato", "felino"];
  return ["perro", "gato", "canino", "felino"];
}

export function prepareIndex(products: SearchIndexItem[]): PreparedIndex {
  const vocabulary = new Set<string>();
  const items = products.map((product) => {
    const nameTokens = tokenize(product.name).map(stem);
    const brandTokens = tokenize(product.brand).map(stem);
    const otherTokens = [
      ...tokenize(`${product.category} ${product.subcategory}`),
      ...speciesTokens(product.species),
    ].map(stem);
    for (const token of [...nameTokens, ...brandTokens, ...otherTokens]) if (token.length >= 3) vocabulary.add(token);
    return {
      product,
      nameTokens,
      brandTokens,
      otherTokens,
      compact: normalizeText(`${product.brand} ${product.name}`).replace(/ /g, ""),
      fullName: normalizeText(`${product.brand} ${product.name}`),
    };
  });
  return { items, vocabulary: [...vocabulary] };
}

function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

const matchesToken = (tokens: string[], term: string) => tokens.some((token) => token.startsWith(term));

/** Puntaje de un término contra un producto; 0 si no aparece. */
function scoreTerm(item: IndexedProduct, alternatives: string[]) {
  let best = 0;
  for (const term of alternatives) {
    // Palabra completa pesa más que un comienzo: "canin" es la marca, no "Canine".
    if (item.brandTokens.includes(term)) best = Math.max(best, 10);
    else if (matchesToken(item.brandTokens, term)) best = Math.max(best, 7);
    if (item.nameTokens[0] === term) best = Math.max(best, 11);
    else if (item.nameTokens.includes(term)) best = Math.max(best, 9);
    else if (matchesToken(item.nameTokens, term)) best = Math.max(best, 6);
    if (matchesToken(item.otherTokens, term)) best = Math.max(best, 4);
    // Marcas o nombres escritos juntos: "proplan", "royalcanin", "catchow".
    if (best === 0 && term.length >= 4 && item.compact.includes(term)) best = 6;
  }
  return best;
}

function alternativesFor(term: string) {
  const base = SYNONYMS[term] ?? [term];
  return [...new Set(base.map(stem))];
}

/** Corrige un término que no aparece en ningún producto por el más parecido del vocabulario. */
function correctTerm(term: string, index: PreparedIndex) {
  if (term.length < 4 || /\d/.test(term)) return null;
  const max = term.length >= 7 ? 2 : 1;
  let best: { word: string; dist: number } | null = null;
  for (const word of index.vocabulary) {
    // Se compara contra la palabra entera y contra su comienzo, para tolerar búsquedas a medio escribir.
    const dist = Math.min(distance(term, word, max), word.length > term.length ? distance(term, word.slice(0, term.length), max) : max + 1);
    if (dist <= max && (!best || dist < best.dist)) best = { word, dist };
  }
  return best?.word ?? null;
}

export function searchProducts(index: PreparedIndex, rawQuery: string, limit = 8): SearchResult {
  const empty: SearchResult = { hits: [], total: 0, correctedQuery: null, species: null };
  const originalTerms = tokenize(rawQuery).map(stem);
  if (!originalTerms.length) return empty;

  let corrected = false;
  const terms = originalTerms.map((term) => {
    const alternatives = alternativesFor(term);
    const found = index.items.some((item) => scoreTerm(item, alternatives) > 0);
    if (found) return term;
    const fix = correctTerm(term, index);
    if (fix) {
      corrected = true;
      return fix;
    }
    return term;
  });

  const phrase = normalizeText(rawQuery);
  const hits: SearchHit[] = [];
  for (const item of index.items) {
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const termScore = scoreTerm(item, alternativesFor(term));
      if (!termScore) {
        matchedAll = false;
        break;
      }
      score += termScore;
    }
    if (!matchedAll) continue;
    if (item.fullName.includes(phrase)) score += 6;
    if (item.product.totalStock > 0) score += 5;
    hits.push({ product: item.product, score });
  }
  hits.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "es"));

  const speciesOnly = originalTerms.length === 1 ? SPECIES_WORDS[originalTerms[0]] ?? null : null;
  return {
    hits: hits.slice(0, limit),
    total: hits.length,
    correctedQuery: corrected ? terms.join(" ") : null,
    species: speciesOnly,
  };
}

/** Marcas con más productos, para las sugerencias rápidas. */
export function topBrands(products: SearchIndexItem[], count = 4) {
  const totals = new Map<string, number>();
  for (const product of products) totals.set(product.brand, (totals.get(product.brand) ?? 0) + 1);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([brand]) => brand);
}
