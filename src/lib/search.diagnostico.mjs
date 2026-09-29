// Diagnóstico del motor de búsqueda contra el catálogo real de la copia local (SQLite).
// Correr con: node src/lib/search.diagnostico.mjs
// Abre data/agrovet.sqlite en SOLO LECTURA. Nunca se conecta a Postgres ni lee .env.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { prepareIndex, searchProducts } from "./search.ts";

const require = createRequire(import.meta.url);
const file = new URL("../../data/agrovet.sqlite", import.meta.url);
if (!existsSync(file)) {
  console.log("No hay data/agrovet.sqlite: el diagnóstico necesita la copia local del catálogo.");
  process.exit(0);
}

const Database = require("better-sqlite3");
const db = new Database(file.pathname.replace(/^\/([A-Za-z]:)/, "$1"), { readonly: true, fileMustExist: true });
const products = db.prepare(`
  SELECT p.id, p.name, p.brand, p.species, p.subcategory_name AS subcategory, c.name AS category,
    (SELECT COALESCE(SUM(i.quantity), 0) FROM inventory i JOIN variants v ON v.id = i.variant_id WHERE v.product_id = p.id) AS totalStock,
    (SELECT GROUP_CONCAT(v.label, '|') FROM variants v WHERE v.product_id = p.id) AS labels
  FROM products p LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.active = 1 AND p.archived_at = '' AND p.purged_at = ''
`).all().map((row) => ({
  ...row,
  // subcategory_name viene como "Perro / Antiparasitarios": el motor usa la última parte.
  subcategory: String(row.subcategory ?? "").split("/").pop().trim(),
  presentations: String(row.labels ?? "").split("|").filter(Boolean),
}));
db.close();

const queries = [
  "royal", "Royal Canin", "royal canin adult", "hipoalergenico", "hipoalergénico", "HIPOALERGENICO",
  "perro", "perros", "gato", "gatos", "perro adulto", "cachorro", "cachorros", "15kg", "15 kg",
  "eukanuva", "royal canin gatos", "pro plan", "proplan", "pipeta", "antiparasitario", "xyzabc",
  "exelent", "bravecto", "gatito",
];

const index = prepareIndex(products);
console.log(`${products.length} productos activos\n`);
for (const query of queries) {
  const started = performance.now();
  const result = searchProducts(index, query, 3);
  const ms = (performance.now() - started).toFixed(2);
  const fix = result.correctedQuery ? ` (corregido: ${result.correctedQuery})` : "";
  const top = result.hits.map((hit) => `${hit.product.brand} ${hit.product.name}`).join(" · ");
  console.log(`${query.padEnd(18)} ${String(result.total).padStart(4)} en ${ms.padStart(5)} ms${fix}  ${top}`);
}
