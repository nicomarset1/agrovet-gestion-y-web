// Pruebas del motor de búsqueda (src/lib/search.ts). Correr con: node src/lib/search.test.mjs
// Node 24 ejecuta el .ts directo (quita los tipos). No usa la base: trae un catálogo de ejemplo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareIndex, productToSearchable, searchIds, searchProducts } from "./search.ts";

let nextId = 1;
const item = (brand, name, subcategory, species, stock = 5, presentations = ["1 kg", "3 kg"]) => ({
  id: nextId++, brand, name, category: "Alimento seco", subcategory, species, totalStock: stock, presentations,
});

const catalog = [
  item("Royal Canin", "Anallergenic Feline", "Hipoalergenico", "gato"),
  item("Royal Canin", "Hypoallergenic Canine", "Hipoalergénico", "perro", 0),
  item("Royal Canin", "Calm Feline", "Estres", "gato"),
  item("Royal Canin", "Mini Adult", "Adultos Razas Pequeñas", "perro", 3, ["1 kg", "7,5 kg", "15 kg"]),
  item("Royal Canin", "Maxi Puppy", "Cachorros", "perro", 2, ["15 kg"]),
  item("Royal Canin", "Kitten", "Gatitos", "gato"),
  item("Purina Pro Plan", "Adult Cat", "Adultos", "gato"),
  item("Purina Pro Plan", "Puppy Razas Medianas", "Cachorros", "perro", 0),
  item("Eukanuba", "Adult Small Breed", "Adultos Razas Pequenas", "perro", 0, ["1 kg", "3 kg", "7,5 kg", "15 kg"]),
  item("Eukanuba", "Kitten Healthy Start", "Gatitos", "gato", 0),
  item("Excellent", "Adult Maintenance", "Adultos", "perro"),
  item("Cat Chow", "Gatitos Pescado, Carne y Vegetales", "Gatitos", "gato", 4, ["500 g", "1 kg"]),
  item("Trixie", "Comedero Acero Inoxidable", "Accesorios", "perro-gato", 1, ["Talle S", "Talle M"]),
];
const index = prepareIndex(catalog);
const names = (query) => searchProducts(index, query, 50).hits.map((hit) => `${hit.product.brand} ${hit.product.name}`);
const count = (query) => searchProducts(index, query, 50).total;

test("varias palabras en cualquier orden", () => {
  assert.equal(count("royal canin gatos"), 3);
  assert.equal(count("gatos royal canin"), 3);
  assert.deepEqual(names("royal canin adult"), ["Royal Canin Mini Adult"]);
});

test("tildes y mayúsculas dan lo mismo", () => {
  assert.equal(count("hipoalergenico"), count("hipoalergénico"));
  assert.equal(count("HIPOALERGENICO"), count("hipoalergénico"));
  assert.ok(count("hipoalergenico") >= 2);
});

test("plurales y equivalencias en inglés", () => {
  assert.equal(count("perros"), count("perro"));
  assert.equal(count("gatos"), count("gato"));
  assert.ok(names("cachorro").includes("Royal Canin Maxi Puppy"));
  assert.ok(names("gatito").includes("Eukanuba Kitten Healthy Start"));
});

test("marcas juntas y errores de tipeo", () => {
  assert.equal(count("proplan"), 2);
  const typo = searchProducts(index, "eukanuva", 50);
  assert.equal(typo.total, 2);
  assert.equal(typo.correctedQuery, "eukanuba");
  assert.equal(searchProducts(index, "exelent", 50).correctedQuery, "excellent");
});

test("presentaciones con y sin espacio", () => {
  assert.equal(count("15kg"), 3);
  assert.equal(count("15 kg"), 3);
  assert.equal(count("7,5 kg"), 2);
  assert.ok(names("500 g").includes("Cat Chow Gatitos Pescado, Carne y Vegetales"));
});

test("relevancia: con stock antes que sin stock", () => {
  const hits = searchProducts(index, "royal canin", 50).hits;
  const firstOut = hits.findIndex((hit) => hit.product.totalStock <= 0);
  assert.ok(hits.slice(firstOut).every((hit) => hit.product.totalStock <= 0));
});

test("especie sola y sin resultados", () => {
  assert.equal(searchProducts(index, "perros", 5).species, "perro");
  assert.equal(searchProducts(index, "royal perro", 5).species, null);
  assert.equal(count("xyzabc"), 0);
  assert.equal(searchIds(catalog, "   "), null);
});

test("searchIds y productToSearchable sirven para /tienda", () => {
  const product = {
    id: 99, slug: "x", name: "Adult Medium", brand: "Royal Canin", category: "Alimento seco", categorySlug: "a",
    subcategory: "Adultos", subcategorySlug: "b", species: "perro", lifeStage: "", size: "", need: "", description: "",
    featured: false, requiresAdvice: false, active: true, color: "", imageUrl: "",
    variants: [{ id: 1, label: "15 kg", sku: "", barcode: "", priceCents: 1, stocks: [], totalStock: 2 }],
  };
  const searchable = productToSearchable(product);
  assert.equal(searchable.totalStock, 2);
  assert.deepEqual(searchIds([searchable], "royal 15kg")?.ids, [99]);
});
