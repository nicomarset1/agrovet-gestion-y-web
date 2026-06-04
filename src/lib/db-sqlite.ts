import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSpecialCategoryHref, isSpecialCategorySlug, specialCategories } from "./special-categories";
import type { AdminReview, Branch, CartItemPayload, CatalogFilters, CatalogMenuNode, Category, OrderRecord, Product, ProductReview, ReviewStatus, SearchIndexItem, Variant, WholesaleClient } from "./types";

const root = process.cwd();
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });
const uncategorizedSubcategorySlug = "sin-subcategoria";
const uncategorizedSubcategoryName = "Sin subcategoría";

const db = new Database(join(dataDir, "agrovet.sqlite"));
db.pragma("busy_timeout = 5000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
`);
db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('sync_version', 0)").run();

function ensureColumn(table: string, column: string, definition: string) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!exists.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function bumpSyncVersion() {
  db.prepare("UPDATE app_meta SET value = value + 1 WHERE key = 'sync_version'").run();
}

export function getSyncVersion() {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'sync_version'").get() as { value?: number } | undefined;
  return row?.value ?? 0;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    map_url TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    show_in_menu INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    species TEXT NOT NULL,
    subcategory_slug TEXT NOT NULL DEFAULT '',
    subcategory_name TEXT NOT NULL DEFAULT '',
    life_stage TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    need TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0,
    requires_advice INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    archived_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory (
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (variant_id, branch_id)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    fulfillment TEXT NOT NULL,
    delivery_address TEXT NOT NULL DEFAULT '',
    delivery_distance_km REAL,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    total_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente de confirmación',
    source TEXT NOT NULL DEFAULT 'Tienda online',
    payment_method TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    PRIMARY KEY (order_id, variant_id)
  );
  CREATE TABLE IF NOT EXISTS order_item_allocations (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (order_id, variant_id, branch_id)
  );
  CREATE TABLE IF NOT EXISTS wholesale_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    tax_id TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_login_attempts (
    identifier TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews(product_id, status);
`);

ensureColumn("branches", "map_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "delivery_address", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "delivery_distance_km", "REAL");
ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "paid_cents", "INTEGER NOT NULL DEFAULT 0");
db.prepare("UPDATE orders SET paid_cents = total_cents WHERE paid_cents = 0 AND payment_method != 'Cuenta corriente'").run();
ensureColumn("categories", "description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("categories", "parent_category_id", "INTEGER REFERENCES categories(id) ON DELETE SET NULL");
ensureColumn("categories", "show_in_menu", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("products", "subcategory_slug", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "subcategory_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "life_stage", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "size", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "need", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "image_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "archived_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("variants", "barcode", "TEXT NOT NULL DEFAULT ''");
db.prepare("UPDATE variants SET barcode = sku WHERE barcode = '' OR barcode IS NULL").run();

function tableColumn(table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]).find((entry) => entry.name === column);
}

function rebuildNullableCategoryTables() {
  const subcategoryCategory = tableColumn("subcategories", "category_id");
  const productCategory = tableColumn("products", "category_id");
  if (!subcategoryCategory?.notnull && !productCategory?.notnull) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.transaction(() => {
    if (subcategoryCategory?.notnull) {
      db.exec(`
        CREATE TABLE subcategories_new (
          id INTEGER PRIMARY KEY,
          category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO subcategories_new (id, category_id, slug, name, description)
        SELECT id, category_id, slug, name, description FROM subcategories;
        DROP TABLE subcategories;
        ALTER TABLE subcategories_new RENAME TO subcategories;
      `);
    }

    if (productCategory?.notnull) {
      db.exec(`
        CREATE TABLE products_new (
          id INTEGER PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          brand TEXT NOT NULL,
          category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          species TEXT NOT NULL,
          subcategory_slug TEXT NOT NULL DEFAULT '',
          subcategory_name TEXT NOT NULL DEFAULT '',
          life_stage TEXT NOT NULL DEFAULT '',
          size TEXT NOT NULL DEFAULT '',
          need TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL,
          featured INTEGER NOT NULL DEFAULT 0,
          requires_advice INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL,
          image_url TEXT NOT NULL DEFAULT '',
          archived_at TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO products_new (
          id, slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
          description, featured, requires_advice, color, image_url, archived_at
        )
        SELECT
          id, slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
          description, featured, requires_advice, color, image_url, ''
        FROM products;
        DROP TABLE products;
        ALTER TABLE products_new RENAME TO products;
      `);
    }
  })();
  db.exec("PRAGMA foreign_keys = ON");
}

rebuildNullableCategoryTables();

const upsertBranch = db.prepare(`
  INSERT INTO branches (id, slug, name, address, phone, map_url, verified)
  VALUES (@id, @slug, @name, @address, @phone, @mapUrl, @verified)
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    address = excluded.address,
    phone = excluded.phone,
    map_url = excluded.map_url,
    verified = excluded.verified
`);
const upsertCategory = db.prepare(`
  INSERT INTO categories (id, slug, name, description, parent_category_id, show_in_menu)
  VALUES (@id, @slug, @name, @description, NULL, @showInMenu)
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    show_in_menu = excluded.show_in_menu
`);
const upsertSpecialCategory = db.prepare(`
  INSERT INTO categories (id, slug, name, description, parent_category_id, show_in_menu)
  VALUES (@id, @slug, @name, @description, NULL, 1)
  ON CONFLICT(slug) DO UPDATE SET
    description = excluded.description,
    parent_category_id = NULL
`);
const upsertSubcategory = db.prepare(`
  INSERT INTO subcategories (slug, category_id, name, description)
  VALUES (@slug, @categoryId, @name, @description)
  ON CONFLICT(slug) DO UPDATE SET
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description
`);
const upsertProduct = db.prepare(`
  INSERT INTO products (
    id, slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
    description, featured, requires_advice, color, image_url
  ) VALUES (
    @id, @slug, @name, @brand, @categoryId, @species, @subcategorySlug, @subcategoryName, @lifeStage, @size, @need,
    @description, @featured, @requiresAdvice, @color, @imageUrl
  )
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    brand = excluded.brand,
    category_id = excluded.category_id,
    species = excluded.species,
    subcategory_slug = excluded.subcategory_slug,
    subcategory_name = excluded.subcategory_name,
    life_stage = excluded.life_stage,
    size = excluded.size,
    need = excluded.need,
    description = excluded.description,
    featured = excluded.featured,
    requires_advice = excluded.requires_advice,
    color = excluded.color,
    image_url = excluded.image_url
`);
const upsertVariant = db.prepare(`
  INSERT INTO variants (id, product_id, label, sku, barcode, price_cents)
  VALUES (@id, @productId, @label, @sku, @barcode, @priceCents)
  ON CONFLICT(id) DO UPDATE SET
    product_id = excluded.product_id,
    label = excluded.label,
    sku = excluded.sku,
    barcode = excluded.barcode,
    price_cents = excluded.price_cents
`);
const upsertInventory = db.prepare(`
  INSERT INTO inventory (variant_id, branch_id, quantity)
  VALUES (@variantId, @branchId, @quantity)
  ON CONFLICT(variant_id, branch_id) DO UPDATE SET
    quantity = excluded.quantity,
    updated_at = CURRENT_TIMESTAMP
`);
const insertOrderAllocation = db.prepare(`
  INSERT INTO order_item_allocations (order_id, variant_id, branch_id, quantity)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(order_id, variant_id, branch_id) DO UPDATE SET
    quantity = excluded.quantity
`);

const branchSeed = [
  { id: 1, slug: "independencia", name: "Sucursal Independencia", address: "Av. Independencia 2599, Mar del Plata", phone: "0223 493-5665", mapUrl: "", verified: 1 },
  { id: 2, slug: "belgrano", name: "Sucursal Belgrano", address: "Belgrano 3898, Mar del Plata", phone: "0223 496-3388", mapUrl: "https://maps.app.goo.gl/i6qdpBif69yS3WKD9", verified: 1 },
];
const categorySeed = [
  { id: 1, slug: "alimentos", name: "Alimentos", description: "Nutrición diaria y alimentos especializados.", showInMenu: 0 },
  { id: 2, slug: "farmacia", name: "Farmacia", description: "Antiparasitarios, tratamiento y cuidado veterinario.", showInMenu: 0 },
  { id: 3, slug: "accesorios", name: "Accesorios", description: "Paseo, descanso, comederos y complementos.", showInMenu: 0 },
  { id: 4, slug: "higiene", name: "Higiene y sanitario", description: "Cuidado, limpieza y productos sanitarios.", showInMenu: 0 },
  { id: 5, slug: "perro", name: "Perro", description: "Productos y categorías para perros.", showInMenu: 1 },
  { id: 6, slug: "gato", name: "Gato", description: "Productos y categorías para gatos.", showInMenu: 1 },
];
const specialCategorySeed = specialCategories.map((category, index) => ({
  id: 1001 + index,
  slug: category.slug,
  name: category.name,
  description: "Página especial del sitio.",
}));
const productSeed = [
  { id: 1, slug: "royal-canin-mini-adult", name: "Mini Adult", brand: "Royal Canin", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "pequeño", need: "", description: "Alimento seco para perros adultos de talla pequeña.", featured: 1, requiresAdvice: 0, color: "#f3b52e", imageUrl: "" },
  { id: 2, slug: "pro-plan-adult-sensitive", name: "Adult Sensitive Skin", brand: "Purina Pro Plan", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "mediano", need: "piel-sensible", description: "Nutrición completa para perros adultos con piel sensible.", featured: 1, requiresAdvice: 0, color: "#173c68", imageUrl: "" },
  { id: 3, slug: "excellent-gato-adulto", name: "Gato Adulto Pollo y Arroz", brand: "Excellent", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento balanceado completo para gatos adultos.", featured: 1, requiresAdvice: 0, color: "#da7134", imageUrl: "" },
  { id: 4, slug: "old-prince-cordero", name: "Cordero y Arroz Adulto", brand: "Old Prince", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "mediano", need: "", description: "Fórmula premium para perros adultos.", featured: 0, requiresAdvice: 0, color: "#7c432e", imageUrl: "" },
  { id: 5, slug: "bravecto-perro", name: "Bravecto Comprimido", brand: "MSD", categoryId: 2, species: "perro", subcategorySlug: "perro-parasitos", subcategoryName: "Perro / Antiparasitarios", lifeStage: "adulto", size: "todos", need: "antiparasitario", description: "Antiparasitario externo. Administrar bajo indicación profesional.", featured: 1, requiresAdvice: 1, color: "#e26146", imageUrl: "" },
  { id: 6, slug: "pipeta-bravecto-gato", name: "Pipeta Bravecto Gato", brand: "MSD", categoryId: 2, species: "gato", subcategorySlug: "gato-parasitos", subcategoryName: "Gato / Antiparasitarios", lifeStage: "adulto", size: "todos", need: "antiparasitario", description: "Pipeta antipulgas para gatos según rango de peso.", featured: 0, requiresAdvice: 1, color: "#7452ac", imageUrl: "" },
  { id: 7, slug: "pretal-confort", name: "Pretal Confort Regulable", brand: "Agrovet Select", categoryId: 3, species: "perro", subcategorySlug: "paseo", subcategoryName: "Paseo y seguridad", lifeStage: "", size: "todos", need: "", description: "Pretal acolchado con ajuste seguro y argolla reforzada.", featured: 1, requiresAdvice: 0, color: "#c8161f", imageUrl: "" },
  { id: 8, slug: "rascador-madera", name: "Rascador Torre Compacta", brand: "Agrovet Select", categoryId: 3, species: "gato", subcategorySlug: "gato-hogar", subcategoryName: "Gato / Descanso y juego", lifeStage: "", size: "todos", need: "", description: "Rascador de sisal con plataforma de descanso.", featured: 0, requiresAdvice: 0, color: "#c28253", imageUrl: "" },
  { id: 9, slug: "comedero-acero", name: "Comedero Acero Inoxidable", brand: "Trixie", categoryId: 3, species: "perro-gato", subcategorySlug: "comedores", subcategoryName: "Comederos y bebederos", lifeStage: "", size: "todos", need: "", description: "Base antideslizante y recipiente lavable.", featured: 0, requiresAdvice: 0, color: "#71889d", imageUrl: "" },
  { id: 10, slug: "piedras-sanitarias", name: "Piedras Sanitarias Premium", brand: "Absorsol", categoryId: 4, species: "gato", subcategorySlug: "gato-sanitario", subcategoryName: "Gato / Sanitario", lifeStage: "", size: "todos", need: "", description: "Alta absorción y control de olores.", featured: 1, requiresAdvice: 0, color: "#53a397", imageUrl: "" },
  { id: 11, slug: "shampoo-hipoalergenico", name: "Shampoo Hipoalergenico", brand: "Osspret", categoryId: 4, species: "perro-gato", subcategorySlug: "higiene", subcategoryName: "Higiene y cuidado", lifeStage: "", size: "todos", need: "piel-sensible", description: "Limpieza suave para pieles sensibles.", featured: 0, requiresAdvice: 0, color: "#3a92b1", imageUrl: "" },
  { id: 12, slug: "vitalcan-balanced-puppy", name: "Balanced Puppy", brand: "Vitalcan", categoryId: 1, species: "perro", subcategorySlug: "cachorros", subcategoryName: "Perro / Cachorros", lifeStage: "cachorro", size: "mediano", need: "", description: "Nutrición para cachorros en etapa de crecimiento.", featured: 0, requiresAdvice: 0, color: "#6f9c3f", imageUrl: "" },
  { id: 13, slug: "eukanuba-cat-adult", name: "Cat Adult", brand: "Eukanuba", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "Nutrición diaria para gatos adultos con alta palatabilidad.", featured: 1, requiresAdvice: 0, color: "#6b4e8b", imageUrl: "" },
  { id: 14, slug: "eukanuba-cat-kitten", name: "Cat Kitten", brand: "Eukanuba", categoryId: 1, species: "gato", subcategorySlug: "gato-cachorros", subcategoryName: "Gato / Cachorros", lifeStage: "cachorro", size: "todos", need: "", description: "Alimento completo para gatitos en crecimiento.", featured: 0, requiresAdvice: 0, color: "#8c6bb0", imageUrl: "" },
  { id: 15, slug: "vitalcan-balanced-cat-adult", name: "Balanced Cat Adult", brand: "Vitalcan", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento seco para gatos adultos con buen equilibrio nutricional.", featured: 1, requiresAdvice: 0, color: "#a34853", imageUrl: "" },
  { id: 16, slug: "cat-it-creamy-multipack", name: "Cat It Creamy Multipack", brand: "Catit", categoryId: 1, species: "gato", subcategorySlug: "gato-snacks", subcategoryName: "Gato / Golosinas y snacks", lifeStage: "adulto", size: "todos", need: "", description: "Snack cremoso para premiar y complementar la dieta.", featured: 0, requiresAdvice: 0, color: "#d68d55", imageUrl: "" },
  { id: 17, slug: "royal-canin-feline-urinary", name: "Feline Urinary S/O", brand: "Royal Canin", categoryId: 1, species: "gato", subcategorySlug: "gato-terapeuticos", subcategoryName: "Gato / Terapéuticos", lifeStage: "adulto", size: "todos", need: "urinario", description: "Formula veterinaria para soporte urinario felino.", featured: 1, requiresAdvice: 1, color: "#4f77a8", imageUrl: "" },
  { id: 18, slug: "lata-vitalcan-cat-adult-salsa", name: "Cat Adult Carne en Salsa", brand: "Vitalcan", categoryId: 1, species: "gato", subcategorySlug: "gato-humedos", subcategoryName: "Gato / Alimentos húmedos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento humedo completo para gatos adultos.", featured: 0, requiresAdvice: 0, color: "#9e5f40", imageUrl: "" },
];
const variantSeed = [
  [101, 1, "1 kg", "RC-MA-1", 1490000, 7, 4], [102, 1, "3 kg", "RC-MA-3", 3580000, 3, 0], [103, 1, "7,5 kg", "RC-MA-75", 7290000, 0, 0],
  [104, 2, "3 kg", "PP-SS-3", 3790000, 5, 1], [105, 2, "12 kg", "PP-SS-12", 10490000, 0, 2],
  [106, 3, "1 kg", "EX-GA-1", 1150000, 9, 3], [107, 3, "7,5 kg", "EX-GA-75", 5420000, 0, 0],
  [108, 4, "3 kg", "OP-CA-3", 2490000, 4, 0], [109, 4, "15 kg", "OP-CA-15", 8620000, 1, 0],
  [110, 5, "2 a 4,5 kg", "BR-P-XS", 2840000, 3, 1], [111, 5, "10 a 20 kg", "BR-P-M", 4310000, 0, 0],
  [112, 6, "1,2 a 2,8 kg", "BR-G-S", 2790000, 2, 0], [113, 6, "2,8 a 6,25 kg", "BR-G-M", 3390000, 0, 0],
  [114, 7, "Talle S", "PR-C-S", 1980000, 4, 2], [115, 7, "Talle M", "PR-C-M", 2280000, 0, 3], [116, 7, "Talle L", "PR-C-L", 2590000, 0, 0],
  [117, 8, "Unico", "RA-MAD", 7490000, 1, 0], [118, 9, "450 ml", "CO-450", 980000, 8, 6],
  [119, 10, "4 kg", "AS-4", 890000, 12, 7], [120, 10, "12 kg", "AS-12", 2390000, 1, 0],
  [121, 11, "250 ml", "SH-H-250", 1120000, 0, 0], [122, 12, "3 kg", "VC-P-3", 2290000, 6, 0],
  [123, 13, "1.5 kg", "EUC-CA-15", 2069000, 8, 2], [124, 13, "7.5 kg", "EUC-CA-75", 7989000, 1, 0],
  [125, 14, "1 kg", "EUC-CK-1", 1519900, 6, 1], [126, 14, "3 kg", "EUC-CK-3", 4220000, 0, 0],
  [127, 15, "3 kg", "VIT-CA-3", 2399000, 10, 4], [128, 15, "7.5 kg", "VIT-CA-75", 6290000, 1, 0],
  [129, 16, "Multipack", "CAT-CREAMY", 5227500, 5, 0],
  [130, 17, "1.5 kg", "RC-UR-15", 2339900, 2, 0],
  [131, 18, "85 g", "VIT-CA-85", 377500, 12, 6], [132, 18, "340 g", "VIT-CA-340", 320900, 7, 2],
];

const subcategorySeed = [...new Map(productSeed.map((product) => ([
  product.subcategorySlug,
  {
    slug: product.subcategorySlug,
    categoryId: product.categoryId,
    name: product.subcategoryName,
    description: "",
  },
] as const))).values()];

db.transaction(() => {
  branchSeed.forEach((branch) => upsertBranch.run(branch));
  categorySeed.forEach((category) => upsertCategory.run(category));
  specialCategorySeed.forEach((category) => upsertSpecialCategory.run(category));
  subcategorySeed.forEach((subcategory) => upsertSubcategory.run(subcategory));
  productSeed.forEach((product) => upsertProduct.run(product));
  variantSeed.forEach(([id, productId, label, sku, priceCents, branch1, branch2]) => {
    upsertVariant.run({ id, productId, label, sku, barcode: sku, priceCents });
    upsertInventory.run({ variantId: id, branchId: 1, quantity: branch1 });
    upsertInventory.run({ variantId: id, branchId: 2, quantity: branch2 });
  });
})();

db.prepare("UPDATE orders SET source = 'Tienda online' WHERE source = 'Caja' AND status NOT LIKE 'Cerrado%'").run();
db.prepare("UPDATE products SET subcategory_slug = ?, subcategory_name = ? WHERE category_id IS NULL OR NOT EXISTS (SELECT 1 FROM subcategories s WHERE s.slug = products.subcategory_slug)")
  .run(uncategorizedSubcategorySlug, uncategorizedSubcategoryName);
bumpSyncVersion();

type ProductRow = {
  id: number; slug: string; name: string; brand: string; category: string; categorySlug: string;
  subcategory: string; subcategorySlug: string; species: Product["species"]; lifeStage: string; size: string; need: string;
  description: string; featured: number; requiresAdvice: number; color: string; imageUrl: string;
};

type VariantRow = {
  id: number; label: string; sku: string; barcode: string; priceCents: number; branchId: number; branchName: string;
  quantity: number;
};

function hydrateProduct(row: ProductRow): Product {
  const stockRows = db.prepare(`
    SELECT v.id, v.label, v.sku, v.barcode, v.price_cents AS priceCents, b.id AS branchId, b.name AS branchName,
      i.quantity
    FROM variants v
    JOIN inventory i ON i.variant_id = v.id
    JOIN branches b ON b.id = i.branch_id
    WHERE v.product_id = ?
    ORDER BY v.price_cents, b.id
  `).all(row.id) as VariantRow[];
  const variants = new Map<number, Variant>();
  for (const variant of stockRows) {
    const current = variants.get(variant.id) ?? {
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      priceCents: variant.priceCents,
      stocks: [],
      totalStock: 0,
    };
    current.stocks.push({ branchId: variant.branchId, branchName: variant.branchName, quantity: variant.quantity });
    current.totalStock += variant.quantity;
    variants.set(variant.id, current);
  }
  return {
    ...row,
    featured: Boolean(row.featured),
    requiresAdvice: Boolean(row.requiresAdvice),
    variants: [...variants.values()],
  };
}

const specialCategoryOrderSql = specialCategories
  .map((category, index) => `WHEN '${category.slug}' THEN ${index}`)
  .join(" ");

type OrderAllocationRow = {
  orderId: number;
  variantId: number;
  branchId: number;
  branchName: string;
  quantity: number;
};

type OrderItemAllocation = {
  branchId: number;
  branchName: string;
  quantity: number;
};

function getAllocationBuckets(orderId: number) {
  const rows = db.prepare(`
    SELECT oa.order_id AS orderId, oa.variant_id AS variantId, oa.branch_id AS branchId,
      b.name AS branchName, oa.quantity
    FROM order_item_allocations oa
    JOIN branches b ON b.id = oa.branch_id
    WHERE oa.order_id = ?
    ORDER BY oa.variant_id, oa.branch_id
  `).all(orderId) as OrderAllocationRow[];
  const byVariant = new Map<number, OrderItemAllocation[]>();
  for (const row of rows) {
    const current = byVariant.get(row.variantId) ?? [];
    current.push({ branchId: row.branchId, branchName: row.branchName, quantity: row.quantity });
    byVariant.set(row.variantId, current);
  }
  return byVariant;
}

function values(input?: string | string[]) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean);
}

function addInClause(clauses: string[], params: string[], expression: string, input?: string | string[]) {
  const selected = values(input);
  if (!selected.length) return;
  clauses.push(`${expression} IN (${selected.map(() => "?").join(", ")})`);
  params.push(...selected);
}

const baseSelect = `
  SELECT p.id, p.slug, p.name, p.brand, COALESCE(c.name, 'Sin categoría') AS category, COALESCE(c.slug, '') AS categorySlug,
    COALESCE(NULLIF(p.subcategory_name, ''), '${uncategorizedSubcategoryName}') AS subcategory,
    COALESCE(NULLIF(p.subcategory_slug, ''), '${uncategorizedSubcategorySlug}') AS subcategorySlug,
    p.species, p.life_stage AS lifeStage, p.size, p.need, p.description, p.featured,
    p.requires_advice AS requiresAdvice, p.color, p.image_url AS imageUrl
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_category_id
`;

export function getProducts(filters: CatalogFilters = {}) {
  const clauses: string[] = ["p.archived_at = ''"];
  const params: string[] = [];
  if (filters.q) {
    clauses.push("(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)");
    const value = `%${filters.q}%`;
    params.push(value, value, value);
  }
  const categories = values(filters.category);
  if (categories.length) {
    clauses.push(`(c.slug IN (${categories.map(() => "?").join(", ")}) OR pc.slug IN (${categories.map(() => "?").join(", ")}))`);
    params.push(...categories, ...categories);
  }
  addInClause(clauses, params, "p.subcategory_slug", filters.subcategory);
  if (filters.pet && filters.pet !== "todos") {
    clauses.push("(p.species = ? OR p.species = 'perro-gato')");
    params.push(filters.pet);
  }
  addInClause(clauses, params, "p.brand", filters.brand);
  addInClause(clauses, params, "p.life_stage", filters.stage);
  const sizes = values(filters.size);
  if (sizes.length) {
    clauses.push(`(p.size IN (${sizes.map(() => "?").join(", ")}) OR p.size = 'todos')`);
    params.push(...sizes);
  }
  const needs = values(filters.need);
  if (needs.length) {
    clauses.push(`(p.need IN (${needs.map(() => "?").join(", ")}) OR p.need = '')`);
    params.push(...needs);
  }
  const presentations = values(filters.presentation);
  if (presentations.length) {
    clauses.push(`EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND (${presentations.map(() => "LOWER(vx.label) LIKE LOWER(?)").join(" OR ")}))`);
    params.push(...presentations.map((presentation) => `%${presentation}%`));
  }
  if (filters.minPrice) {
    const cents = Math.round(Number(filters.minPrice) * 100);
    if (Number.isFinite(cents)) {
      clauses.push("EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND vx.price_cents >= ?)");
      params.push(String(cents));
    }
  }
  if (filters.maxPrice) {
    const cents = Math.round(Number(filters.maxPrice) * 100);
    if (Number.isFinite(cents)) {
      clauses.push("EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND vx.price_cents <= ?)");
      params.push(String(cents));
    }
  }
  if (filters.stock === "disponible") {
    clauses.push("EXISTS (SELECT 1 FROM variants vx JOIN inventory ix ON ix.variant_id = vx.id WHERE vx.product_id = p.id AND ix.quantity > 0)");
  }
  let orderBy = "ORDER BY p.featured DESC, p.name";
  if (filters.sort === "price_asc") {
    orderBy = "ORDER BY (SELECT MIN(price_cents) FROM variants WHERE product_id = p.id) ASC, p.name";
  } else if (filters.sort === "price_desc") {
    orderBy = "ORDER BY (SELECT MIN(price_cents) FROM variants WHERE product_id = p.id) DESC, p.name";
  } else if (filters.sort === "stock_desc") {
    orderBy = "ORDER BY (SELECT COALESCE(SUM(quantity), 0) FROM inventory i JOIN variants v ON v.id = i.variant_id WHERE v.product_id = p.id) DESC, p.name";
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`${baseSelect}${where} ${orderBy}`).all(...params) as ProductRow[];
  return rows.map(hydrateProduct);
}

export function getProduct(slug: string) {
  const row = db.prepare(`${baseSelect} WHERE p.slug = ? AND p.archived_at = ''`).get(slug) as ProductRow | undefined;
  return row ? hydrateProduct(row) : undefined;
}

export function getFeaturedProducts() {
  return getProducts().filter((product) => product.featured).slice(0, 4);
}

export function createReview(input: { productId: number; authorName: string; rating: number; body: string }) {
  const exists = db.prepare("SELECT 1 FROM products WHERE id = ? AND archived_at = ''").get(input.productId);
  if (!exists) throw new Error("Producto inexistente.");
  const info = db.prepare(
    "INSERT INTO product_reviews (product_id, author_name, rating, body, status) VALUES (?, ?, ?, ?, 'pending')",
  ).run(input.productId, input.authorName, input.rating, input.body);
  return { id: Number(info.lastInsertRowid) };
}

export function getPublishedReviews(productId: number): ProductReview[] {
  return db.prepare(`
    SELECT id, product_id AS productId, author_name AS authorName, rating, body, status, created_at AS createdAt
    FROM product_reviews
    WHERE product_id = ? AND status = 'published'
    ORDER BY created_at DESC, id DESC
  `).all(productId) as ProductReview[];
}

export function getAdminReviews(): AdminReview[] {
  return db.prepare(`
    SELECT r.id, r.product_id AS productId, r.author_name AS authorName, r.rating, r.body, r.status,
      r.created_at AS createdAt, p.name AS productName, p.slug AS productSlug
    FROM product_reviews r
    JOIN products p ON p.id = r.product_id
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, r.created_at DESC, r.id DESC
  `).all() as AdminReview[];
}

export function setReviewStatus(id: number, status: ReviewStatus) {
  db.prepare("UPDATE product_reviews SET status = ? WHERE id = ?").run(status, id);
  bumpSyncVersion();
}

export function deleteReview(id: number) {
  db.prepare("DELETE FROM product_reviews WHERE id = ?").run(id);
  bumpSyncVersion();
}

export function getCategories() {
  const rows = db.prepare(`
    SELECT c.id, c.slug, c.name, c.description, c.show_in_menu AS showInMenu,
      c.parent_category_id AS parentCategoryId,
      p.slug AS parentCategorySlug,
      p.name AS parentCategoryName
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_category_id
    ORDER BY
      CASE WHEN c.slug IN (${specialCategories.map((category) => `'${category.slug}'`).join(", ")}) THEN 1 ELSE 0 END,
      CASE WHEN c.slug IN (${specialCategories.map((category) => `'${category.slug}'`).join(", ")}) THEN CASE c.slug ${specialCategoryOrderSql} ELSE 999 END ELSE COALESCE(p.id, c.id) END,
      c.parent_category_id IS NOT NULL,
      c.name
  `).all() as Array<Omit<Category, "showInMenu"> & { showInMenu: number }>;
  return rows.map((row) => ({ ...row, showInMenu: Boolean(row.showInMenu) }));
}

export function getSubcategories() {
  return db.prepare(`
    SELECT s.slug AS slug, s.name AS name, s.description AS description,
      c.id AS categoryId, c.slug AS categorySlug, c.name AS categoryName, COUNT(p.id) AS count
    FROM subcategories s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN products p ON p.subcategory_slug = s.slug
    GROUP BY s.slug, s.name, s.description, c.id, c.slug, c.name
    ORDER BY COALESCE(c.name, 'Sin categoría'), s.name
  `).all() as { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null; count: number }[];
}

export function getSubcategoryBySlug(slug: string) {
  return db.prepare(`
    SELECT s.slug AS slug, s.name AS name, s.description AS description,
      c.id AS categoryId, c.slug AS categorySlug, c.name AS categoryName
    FROM subcategories s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.slug = ?
  `).get(slug) as { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null } | undefined;
}

export function getBranches() {
  const rows = db.prepare("SELECT id, slug, name, address, phone, map_url AS mapUrl, verified FROM branches ORDER BY id").all() as (Omit<Branch, "verified"> & { verified: number })[];
  return rows.map((row) => ({ ...row, verified: Boolean(row.verified) }));
}

export function getWholesaleClients(): WholesaleClient[] {
  return db.prepare(`
    SELECT id, business_name AS businessName, contact_name AS contactName, phone, email,
      address, tax_id AS taxId, notes, created_at AS createdAt
    FROM wholesale_clients
    ORDER BY business_name COLLATE NOCASE
  `).all() as WholesaleClient[];
}

export function createWholesaleClient(input: {
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
}) {
  const result = db.prepare(`
    INSERT INTO wholesale_clients (business_name, contact_name, phone, email, address, tax_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.businessName.trim(),
    input.contactName?.trim() ?? "",
    input.phone?.trim() ?? "",
    input.email?.trim() ?? "",
    input.address?.trim() ?? "",
    input.taxId?.trim() ?? "",
    input.notes?.trim() ?? "",
  );
  return Number(result.lastInsertRowid);
}

export function updateWholesaleClient(input: WholesaleClient) {
  db.prepare(`
    UPDATE wholesale_clients
    SET business_name = ?, contact_name = ?, phone = ?, email = ?, address = ?, tax_id = ?, notes = ?
    WHERE id = ?
  `).run(
    input.businessName.trim(),
    input.contactName.trim(),
    input.phone.trim(),
    input.email.trim(),
    input.address.trim(),
    input.taxId.trim(),
    input.notes.trim(),
    input.id,
  );
}

export function deleteWholesaleClient(id: number) {
  db.prepare("DELETE FROM wholesale_clients WHERE id = ?").run(id);
}

function mapAdminOrders(): OrderRecord[] {
  const orders = db.prepare(`
    SELECT o.id, o.code, o.customer_name AS customerName, o.phone, o.email, o.fulfillment,
      o.delivery_address AS deliveryAddress, o.delivery_distance_km AS deliveryDistanceKm,
      o.branch_id AS branchId, b.name AS branchName, o.total_cents AS totalCents, o.status,
      o.source, o.payment_method AS paymentMethod, o.paid_cents AS paidCents, o.created_at AS createdAt
    FROM orders o
    JOIN branches b ON b.id = o.branch_id
    ORDER BY o.created_at DESC, o.id DESC
  `).all() as Omit<OrderRecord, "itemCount" | "items">[];
  if (!orders.length) return [];
  const items = db.prepare(`
    SELECT oi.order_id AS orderId, oi.variant_id AS variantId, p.name AS productName, p.brand,
      v.label, v.sku, oi.quantity, oi.unit_price_cents AS unitPriceCents
    FROM order_items oi
    JOIN variants v ON v.id = oi.variant_id
    JOIN products p ON p.id = v.product_id
    ORDER BY oi.order_id DESC, p.brand, p.name, v.label
  `).all() as Array<{ orderId: number; variantId: number; productName: string; brand: string; label: string; sku: string; quantity: number; unitPriceCents: number }>;
  const itemsByOrder = new Map<number, OrderRecord["items"]>();
  const allocationBuckets = new Map<number, Map<number, OrderItemAllocation[]>>();
  const allocationRows = db.prepare(`
    SELECT oa.order_id AS orderId, oa.variant_id AS variantId, oa.branch_id AS branchId,
      b.name AS branchName, oa.quantity
    FROM order_item_allocations oa
    JOIN branches b ON b.id = oa.branch_id
    ORDER BY oa.order_id DESC, oa.variant_id, oa.branch_id
  `).all() as OrderAllocationRow[];
  for (const row of allocationRows) {
    const orderBuckets = allocationBuckets.get(row.orderId) ?? new Map<number, OrderItemAllocation[]>();
    const current = orderBuckets.get(row.variantId) ?? [];
    current.push({ branchId: row.branchId, branchName: row.branchName, quantity: row.quantity });
    orderBuckets.set(row.variantId, current);
    allocationBuckets.set(row.orderId, orderBuckets);
  }
  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    const orderBuckets = allocationBuckets.get(item.orderId);
    const allocations = orderBuckets?.get(item.variantId) ?? [];
    current.push({
      variantId: item.variantId,
      productName: item.productName,
      brand: item.brand,
      label: item.label,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      allocations: allocations.length ? allocations : undefined,
    });
    itemsByOrder.set(item.orderId, current);
  }
  return orders.map((order) => ({
    ...order,
    paymentMethod: order.paymentMethod ?? "",
    paidCents: order.paidCents ?? order.totalCents,
    itemCount: itemsByOrder.get(order.id)?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

export function getAdminSnapshot() {
  return { products: getProducts(), branches: getBranches(), orders: mapAdminOrders(), wholesaleClients: getWholesaleClients() };
}

export function getCatalogFacets() {
  const products = getProducts();
  const allCategories = getCategories();
  const allSubcategories = getSubcategories();
  const categoriesBySlug = new Map(allCategories.map((category) => [category.slug, category]));
  const categories = new Map<string, { name: string; count: number; subcategories: Map<string, { name: string; count: number }> }>();
  for (const category of allCategories) {
    categories.set(category.slug, { name: category.name, count: 0, subcategories: new Map() });
  }
  for (const subcategory of allSubcategories) {
    if (!subcategory.categorySlug) continue;
    const category = categories.get(subcategory.categorySlug);
    if (category) category.subcategories.set(subcategory.slug, { name: subcategory.name, count: 0 });
  }
  const brands = new Map<string, number>();
  const lifeStages = new Map<string, number>();
  const sizes = new Map<string, number>();
  const needs = new Map<string, number>();
  const species = new Map<string, number>();
  const presentations = new Map<string, number>();
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;
  for (const product of products) {
    const addCategoryFacet = (slug: string, name: string) => {
      const category = categories.get(slug) ?? { name, count: 0, subcategories: new Map() };
      category.count += 1;
      category.subcategories.set(product.subcategorySlug, {
        name: product.subcategory,
        count: (category.subcategories.get(product.subcategorySlug)?.count ?? 0) + 1,
      });
      categories.set(slug, category);
    };
    if (product.categorySlug) {
      addCategoryFacet(product.categorySlug, product.category);
      const parent = categoriesBySlug.get(product.categorySlug);
      if (parent?.parentCategorySlug) addCategoryFacet(parent.parentCategorySlug, parent.parentCategoryName ?? parent.name);
    }
    brands.set(product.brand, (brands.get(product.brand) ?? 0) + 1);
    species.set(product.species, (species.get(product.species) ?? 0) + 1);
    if (product.lifeStage) lifeStages.set(product.lifeStage, (lifeStages.get(product.lifeStage) ?? 0) + 1);
    if (product.size) sizes.set(product.size, (sizes.get(product.size) ?? 0) + 1);
    if (product.need) needs.set(product.need, (needs.get(product.need) ?? 0) + 1);
    for (const variant of product.variants) {
      presentations.set(variant.label, (presentations.get(variant.label) ?? 0) + 1);
      minPrice = Math.min(minPrice, Math.round(variant.priceCents / 100));
      maxPrice = Math.max(maxPrice, Math.round(variant.priceCents / 100));
    }
  }
  return {
    categories: [...categories.entries()].map(([slug, value]) => ({ slug, ...value, subcategories: [...value.subcategories.entries()].map(([subSlug, subValue]) => ({ slug: subSlug, ...subValue })) })),
    brands: [...brands.entries()].map(([name, count]) => ({ name, count })),
    lifeStages: [...lifeStages.entries()].map(([name, count]) => ({ name, count })),
    sizes: [...sizes.entries()].map(([name, count]) => ({ name, count })),
    needs: [...needs.entries()].map(([name, count]) => ({ name, count })),
    species: [...species.entries()].map(([name, count]) => ({ name, count })),
    presentations: [...presentations.entries()].map(([name, count]) => ({ name, count })),
    priceRange: { min: Number.isFinite(minPrice) ? minPrice : 0, max: maxPrice },
  };
}

export function getSearchIndex(): SearchIndexItem[] {
  return getProducts().map((product) => {
    const available = product.variants.filter((variant) => variant.totalStock > 0);
    const priceCents = available.length ? Math.min(...available.map((variant) => variant.priceCents)) : product.variants[0]?.priceCents ?? 0;
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      categorySlug: product.categorySlug,
      subcategory: product.subcategory,
      subcategorySlug: product.subcategorySlug,
      species: product.species,
      priceCents,
      totalStock: product.variants.reduce((sum, variant) => sum + variant.totalStock, 0),
    };
  });
}

export function getCatalogMenu(): CatalogMenuNode[] {
  const products = getProducts();
  const categories = getCategories();
  const subcategories = getSubcategories();
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
  const rootCategories = new Set(categories.filter((category) => category.showInMenu).map((category) => category.slug));
  const rootFor = (categorySlug?: string | null) => {
    if (!categorySlug) return "";
    return categoriesBySlug.get(categorySlug)?.parentCategorySlug ?? categorySlug;
  };
  type MenuBucket = { label: string; count: number; children: Map<string, MenuBucket> };
  const rootCategoryMap = new Map<string, MenuBucket>();
  const addChild = (parent: MenuBucket, slug: string, label: string, count = 1) => {
    const child = parent.children.get(slug) ?? { label, count: 0, children: new Map() };
    child.count += count;
    parent.children.set(slug, child);
    return child;
  };
  const toNodes = (items: Map<string, MenuBucket>, hrefFor: (slugPath: string[]) => string, path: string[] = []): CatalogMenuNode[] => [...items.entries()].map(([slug, item]) => {
    const nextPath = [...path, slug];
    const specialHref = path.length === 0 ? getSpecialCategoryHref(slug) : undefined;
    return {
      label: item.label,
      href: hrefFor(nextPath),
      count: specialHref ? undefined : item.count,
      children: item.children.size ? toNodes(item.children, hrefFor, nextPath) : undefined,
    };
  });
  for (const category of categories.filter((item) => item.showInMenu && !item.parentCategoryId)) {
    rootCategoryMap.set(category.slug, { label: category.name, count: 0, children: new Map() });
  }
  for (const category of categories.filter((item) => item.parentCategorySlug && rootCategories.has(item.parentCategorySlug))) {
    const root = rootCategoryMap.get(category.parentCategorySlug ?? "");
    if (root) addChild(root, category.slug, category.name, 0);
  }
  for (const subcategory of subcategories) {
    if (!subcategory.categorySlug) continue;
    const category = categoriesBySlug.get(subcategory.categorySlug);
    const rootSlug = rootFor(subcategory.categorySlug);
    const root = rootCategoryMap.get(rootSlug);
    if (!category || !root || !rootCategories.has(rootSlug)) continue;
    const parent = category.parentCategorySlug ? addChild(root, category.slug, category.name, 0) : root;
    addChild(parent, subcategory.slug, subcategory.name, 0);
  }
  for (const product of products) {
    if (!product.categorySlug) continue;
    const rootSlug = rootFor(product.categorySlug);
    if (!rootCategories.has(rootSlug)) continue;
    const rootCategory = categoriesBySlug.get(rootSlug);
    const root = rootCategoryMap.get(rootSlug) ?? { label: rootCategory?.name ?? product.category, count: 0, children: new Map() };
    root.count += 1;
    if (product.categorySlug !== rootSlug) {
      const child = addChild(root, product.categorySlug, product.category);
      addChild(child, product.subcategorySlug, product.subcategory);
    } else {
      addChild(root, product.subcategorySlug, product.subcategory);
    }
    rootCategoryMap.set(rootSlug, root);
  }
  const rootNodes = toNodes(rootCategoryMap, ([rootSlug, childOrSubSlug, subcategorySlug]) => {
    const specialHref = !childOrSubSlug ? getSpecialCategoryHref(rootSlug) : undefined;
    if (specialHref) return specialHref;
    if (subcategorySlug) return `/tienda?category=${childOrSubSlug}&subcategory=${subcategorySlug}`;
    if (childOrSubSlug) {
      const maybeCategory = categoriesBySlug.get(childOrSubSlug);
      return maybeCategory ? `/tienda?category=${childOrSubSlug}` : `/tienda?category=${rootSlug}&subcategory=${childOrSubSlug}`;
    }
    return `/tienda?category=${rootSlug}`;
  });
  return rootNodes;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueSlug(table: "categories" | "subcategories" | "products", baseSlug: string, excludeId?: number) {
  const normalized = baseSlug || "item";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const query = excludeId
      ? db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`)
      : db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
    const row = excludeId ? query.get(next, excludeId) : query.get(next);
    if (!row) return next;
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

function uniqueVariantSku(baseSku: string, taken: Set<string>, excludeId?: number) {
  const normalized = baseSku.trim() || "sku";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const existsInForm = taken.has(next);
    const query = excludeId
      ? db.prepare("SELECT id FROM variants WHERE sku = ? AND id != ?")
      : db.prepare("SELECT id FROM variants WHERE sku = ?");
    const row = excludeId ? query.get(next, excludeId) : query.get(next);
    if (!existsInForm && !row) {
      taken.add(next);
      return next;
    }
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

function uniqueVariantBarcode(baseBarcode: string, taken: Set<string>, excludeId?: number) {
  const normalized = baseBarcode.trim();
  if (!normalized) return "";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const existsInForm = taken.has(next);
    const query = excludeId
      ? db.prepare("SELECT id FROM variants WHERE barcode = ? AND id != ?")
      : db.prepare("SELECT id FROM variants WHERE barcode = ?");
    const row = excludeId ? query.get(next, excludeId) : query.get(next);
    if (!existsInForm && !row) {
      taken.add(next);
      return next;
    }
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

function normalizeCategoryPlacement(input: { id?: number; showInMenu?: boolean; parentCategoryId?: number | null }) {
  if (input.showInMenu) return null;
  if (!input.parentCategoryId) return null;
  if (input.id && input.parentCategoryId === input.id) throw new Error("Una categoría no puede depender de sí misma.");
  const parent = db.prepare("SELECT id, slug FROM categories WHERE id = ? AND show_in_menu = 1 AND parent_category_id IS NULL").get(input.parentCategoryId) as { id: number; slug: string } | undefined;
  if (!parent) throw new Error("Elegí una categoría principal válida.");
  if (isSpecialCategorySlug(parent.slug)) throw new Error("Las categorías fijas no aceptan categorías internas.");
  return input.parentCategoryId;
}

function assertProductCategory(categoryId: number | null) {
  if (!categoryId) return;
  const category = db.prepare("SELECT slug FROM categories WHERE id = ?").get(categoryId) as { slug: string } | undefined;
  if (!category) throw new Error("Elegí una categoría válida.");
  if (isSpecialCategorySlug(category.slug)) throw new Error("Las páginas fijas no pueden usarse como categoría de producto.");
}

function resolveProductCategory(input: { categoryId: number | null; subcategorySlug: string }) {
  if (!input.categoryId) {
    return {
      categoryId: null,
      subcategorySlug: uncategorizedSubcategorySlug,
      subcategoryName: uncategorizedSubcategoryName,
    };
  }
  if (input.subcategorySlug === uncategorizedSubcategorySlug) {
    assertProductCategory(input.categoryId);
    return {
      categoryId: input.categoryId,
      subcategorySlug: uncategorizedSubcategorySlug,
      subcategoryName: uncategorizedSubcategoryName,
    };
  }
  const subcategory = getSubcategoryBySlug(input.subcategorySlug);
  if (!subcategory) throw new Error("Subcategoría inválida.");
  assertProductCategory(subcategory.categoryId);
  return {
    categoryId: subcategory.categoryId,
    subcategorySlug: subcategory.slug,
    subcategoryName: subcategory.name,
  };
}

export function createCategory(input: { name: string; slug?: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  const slug = uniqueSlug("categories", slugify(input.slug || input.name));
  const parentCategoryId = normalizeCategoryPlacement(input);
  db.prepare("INSERT INTO categories (slug, name, description, parent_category_id, show_in_menu) VALUES (?, ?, ?, ?, ?)")
    .run(slug, input.name.trim(), input.description ?? "", parentCategoryId, input.showInMenu ? 1 : 0);
  bumpSyncVersion();
}

export function updateCategory(input: { id: number; name: string; slug: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  const current = db.prepare("SELECT slug FROM categories WHERE id = ?").get(input.id) as { slug: string } | undefined;
  if (current && isSpecialCategorySlug(current.slug)) {
    db.prepare("UPDATE categories SET name = ?, parent_category_id = NULL, show_in_menu = ? WHERE id = ?")
      .run(input.name.trim(), input.showInMenu ? 1 : 0, input.id);
    bumpSyncVersion();
    return;
  }
  const slug = uniqueSlug("categories", slugify(input.slug), input.id);
  const parentCategoryId = normalizeCategoryPlacement(input);
  db.transaction(() => {
    if (!input.showInMenu) {
      db.prepare("UPDATE categories SET parent_category_id = NULL WHERE parent_category_id = ?").run(input.id);
    }
    db.prepare("UPDATE categories SET name = ?, slug = ?, description = ?, parent_category_id = ?, show_in_menu = ? WHERE id = ?")
      .run(input.name.trim(), slug, input.description ?? "", parentCategoryId, input.showInMenu ? 1 : 0, input.id);
    bumpSyncVersion();
  })();
}

export function deleteCategory(id: number) {
  db.transaction(() => {
    const category = db.prepare("SELECT id, slug FROM categories WHERE id = ?").get(id) as { id: number; slug: string } | undefined;
    if (!category) return;
    if (isSpecialCategorySlug(category.slug)) throw new Error("Esta categoría fija no se puede eliminar.");

    const directChildren = db.prepare("SELECT id FROM categories WHERE parent_category_id = ?").all(id) as { id: number }[];
    if (directChildren.length) {
      db.prepare("UPDATE categories SET parent_category_id = NULL WHERE parent_category_id = ?").run(id);
    }

    const directSubcategories = db.prepare("SELECT slug FROM subcategories WHERE category_id = ?").all(id) as { slug: string }[];
    if (directSubcategories.length) {
      db.prepare("UPDATE subcategories SET category_id = NULL WHERE category_id = ?").run(id);
    }

    const affectedSubcategorySlugs = directSubcategories.map((row) => row.slug);
    if (affectedSubcategorySlugs.length) {
      db.prepare(`UPDATE products SET category_id = NULL, subcategory_slug = ?, subcategory_name = ? WHERE subcategory_slug IN (${affectedSubcategorySlugs.map(() => "?").join(", ")})`)
        .run(uncategorizedSubcategorySlug, uncategorizedSubcategoryName, ...affectedSubcategorySlugs);
    }
    db.prepare("UPDATE products SET category_id = NULL, subcategory_slug = ?, subcategory_name = ? WHERE category_id = ?")
      .run(uncategorizedSubcategorySlug, uncategorizedSubcategoryName, id);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    bumpSyncVersion();
  })();
}

export function deleteProduct(id: number) {
  db.transaction(() => {
    const variants = db.prepare("SELECT id FROM variants WHERE product_id = ?").all(id) as { id: number }[];
    const variantIds = variants.map((variant) => variant.id);
    if (variantIds.length) {
      const placeholders = variantIds.map(() => "?").join(", ");
      const hasOrderItems = db.prepare(`SELECT 1 FROM order_items WHERE variant_id IN (${placeholders}) LIMIT 1`).get(...variantIds);
      if (hasOrderItems) {
        db.prepare("UPDATE products SET archived_at = CURRENT_TIMESTAMP, featured = 0 WHERE id = ?").run(id);
        bumpSyncVersion();
        return;
      }
      db.prepare(`DELETE FROM order_item_allocations WHERE variant_id IN (${placeholders})`).run(...variantIds);
      db.prepare(`DELETE FROM inventory WHERE variant_id IN (${placeholders})`).run(...variantIds);
      db.prepare(`DELETE FROM variants WHERE id IN (${placeholders})`).run(...variantIds);
    }
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    bumpSyncVersion();
  })();
}

export function createSubcategory(input: { categoryId: number; name: string; description?: string }) {
  const category = db.prepare("SELECT slug FROM categories WHERE id = ?").get(input.categoryId) as { slug: string } | undefined;
  if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorías fijas no aceptan subcategorías.");
  const slug = uniqueSlug("subcategories", slugify(input.name));
  db.prepare("INSERT INTO subcategories (category_id, slug, name, description) VALUES (?, ?, ?, ?)")
    .run(input.categoryId, slug, input.name.trim(), input.description ?? "");
  bumpSyncVersion();
}

export function updateSubcategory(input: { oldSlug: string; categoryId: number; name: string; description?: string }) {
  const category = db.prepare("SELECT slug FROM categories WHERE id = ?").get(input.categoryId) as { slug: string } | undefined;
  if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorías fijas no aceptan subcategorías.");
  const nextSlug = uniqueSlug("subcategories", slugify(input.name));
  db.prepare("UPDATE subcategories SET category_id = ?, slug = ?, name = ?, description = ? WHERE slug = ?")
    .run(input.categoryId, nextSlug, input.name.trim(), input.description ?? "", input.oldSlug);
  db.prepare("UPDATE products SET category_id = ?, subcategory_slug = ?, subcategory_name = ? WHERE subcategory_slug = ?")
    .run(input.categoryId, nextSlug, input.name.trim(), input.oldSlug);
  bumpSyncVersion();
}

export function deleteSubcategory(slug: string) {
  db.prepare("UPDATE products SET subcategory_slug = ?, subcategory_name = ? WHERE subcategory_slug = ?")
    .run(uncategorizedSubcategorySlug, uncategorizedSubcategoryName, slug);
  db.prepare("DELETE FROM subcategories WHERE slug = ?").run(slug);
  bumpSyncVersion();
}

type ProductVariantInput = {
  id?: number;
  label: string;
  sku: string;
  barcode: string;
  priceCents: number;
  stockByBranch: { branchId: number; quantity: number }[];
};

export function updateProduct(input: {
  id: number;
  name: string;
  brand: string;
  categoryId: number | null;
  species: Product["species"];
  subcategorySlug: string;
  lifeStage?: string;
  size?: string;
  need?: string;
  description: string;
  featured: boolean;
  requiresAdvice: boolean;
  color: string;
  imageUrl?: string;
  variants: ProductVariantInput[];
}) {
  return db.transaction(() => {
    const placement = resolveProductCategory(input);
    db.prepare(`
      UPDATE products SET
        name = ?, brand = ?, category_id = ?, species = ?, subcategory_slug = ?, subcategory_name = ?,
        life_stage = ?, size = ?, need = ?, description = ?, featured = ?, requires_advice = ?, color = ?, image_url = ?
      WHERE id = ?
    `).run(
      input.name.trim(),
      input.brand.trim(),
      placement.categoryId,
      input.species,
      placement.subcategorySlug,
      placement.subcategoryName,
      input.lifeStage ?? "",
      input.size ?? "",
      input.need ?? "",
      input.description.trim(),
      input.featured ? 1 : 0,
      input.requiresAdvice ? 1 : 0,
      input.color,
      input.imageUrl ?? "",
      input.id,
    );
    const insertVariant = db.prepare("INSERT INTO variants (product_id, label, sku, barcode, price_cents) VALUES (?, ?, ?, ?, ?)");
    const updateVariant = db.prepare("UPDATE variants SET label = ?, sku = ?, barcode = ?, price_cents = ? WHERE id = ?");
    const insertInventory = db.prepare("INSERT INTO inventory (variant_id, branch_id, quantity) VALUES (?, ?, ?) ON CONFLICT(variant_id, branch_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP");
    const takenSkus = new Set<string>();
    const takenBarcodes = new Set<string>();
    for (const variant of input.variants) {
      const nextSku = uniqueVariantSku(variant.sku, takenSkus, variant.id);
      const nextBarcode = uniqueVariantBarcode(variant.barcode.trim() || nextSku, takenBarcodes, variant.id);
      const variantId = variant.id ?? Number(insertVariant.run(input.id, variant.label.trim(), nextSku, nextBarcode, variant.priceCents).lastInsertRowid);
      if (variant.id) {
        updateVariant.run(variant.label.trim(), nextSku, nextBarcode, variant.priceCents, variant.id);
      }
      for (const stock of variant.stockByBranch) {
        insertInventory.run(variantId, stock.branchId, Math.max(0, stock.quantity));
      }
    }
    bumpSyncVersion();
  })();
}

export function createProduct(input: {
  name: string;
  brand: string;
  categoryId: number | null;
  species: Product["species"];
  subcategorySlug: string;
  lifeStage?: string;
  size?: string;
  need?: string;
  description: string;
  featured: boolean;
  requiresAdvice: boolean;
  color: string;
  imageUrl?: string;
  variants: ProductVariantInput[];
}) {
  return db.transaction(() => {
    const placement = resolveProductCategory(input);
    let slug = slugify(`${input.brand}-${input.name}`);
    const exists = db.prepare("SELECT id FROM products WHERE slug = ?").get(slug);
    if (exists) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    const inserted = db.prepare(`
      INSERT INTO products (
        slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
        description, featured, requires_advice, color, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      input.name.trim(),
      input.brand.trim(),
      placement.categoryId,
      input.species,
      placement.subcategorySlug,
      placement.subcategoryName,
      input.lifeStage ?? "",
      input.size ?? "",
      input.need ?? "",
      input.description.trim(),
      input.featured ? 1 : 0,
      input.requiresAdvice ? 1 : 0,
      input.color,
      input.imageUrl ?? "",
    );
    const productId = Number(inserted.lastInsertRowid);
    const insertVariant = db.prepare("INSERT INTO variants (product_id, label, sku, barcode, price_cents) VALUES (?, ?, ?, ?, ?)");
    const insertInventory = db.prepare("INSERT INTO inventory (variant_id, branch_id, quantity) VALUES (?, ?, ?)");
    const takenSkus = new Set<string>();
    const takenBarcodes = new Set<string>();
    for (const variant of input.variants) {
      const nextSku = uniqueVariantSku(variant.sku, takenSkus);
      const nextBarcode = uniqueVariantBarcode(variant.barcode.trim() || nextSku, takenBarcodes);
      const insertedVariant = insertVariant.run(productId, variant.label.trim(), nextSku, nextBarcode, variant.priceCents);
      const variantId = Number(insertedVariant.lastInsertRowid);
      for (const stock of variant.stockByBranch) {
        insertInventory.run(variantId, stock.branchId, Math.max(0, stock.quantity));
      }
    }
    bumpSyncVersion();
  })();
}

export function updateInventory(variantId: number, branchId: number, quantity: number) {
  db.prepare("UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ? AND branch_id = ?")
    .run(Math.max(0, quantity), variantId, branchId);
  bumpSyncVersion();
}

export function getInventoryQuantity(variantId: number, branchId: number) {
  const row = db.prepare("SELECT quantity FROM inventory WHERE variant_id = ? AND branch_id = ?").get(variantId, branchId) as { quantity?: number } | undefined;
  return row?.quantity ?? 0;
}

export function addInventory(variantId: number, branchId: number, delta: number) {
  const current = getInventoryQuantity(variantId, branchId);
  updateInventory(variantId, branchId, current + Math.max(0, delta));
}

function resolveDeliveryAllocationPlan(items: CartItemPayload[]) {
  const branches = branchSeed.filter((branch) => branch.verified).map((branch) => branch.id);
  const variantAllocations = items.map((item) => {
    let remaining = item.quantity;
    const rankedBranches = branches.map((branchId) => {
      const row = db.prepare("SELECT quantity FROM inventory WHERE variant_id = ? AND branch_id = ?").get(item.variantId, branchId) as { quantity?: number } | undefined;
      return { branchId, quantity: row?.quantity ?? 0 };
    }).sort((a, b) => b.quantity - a.quantity || a.branchId - b.branchId);
    const allocations: { branchId: number; quantity: number }[] = [];
    for (const branch of rankedBranches) {
      if (remaining <= 0) break;
      if (branch.quantity <= 0) continue;
      const quantity = Math.min(remaining, branch.quantity);
      allocations.push({ branchId: branch.branchId, quantity });
      remaining -= quantity;
    }
    if (remaining > 0) throw new Error("No hay stock suficiente para armar el envío.");
    return { variantId: item.variantId, allocations };
  });
  const branchTotals = new Map<number, number>();
  for (const item of variantAllocations) {
    for (const allocation of item.allocations) {
      branchTotals.set(allocation.branchId, (branchTotals.get(allocation.branchId) ?? 0) + allocation.quantity);
    }
  }
  const rankedBranches = [...branchTotals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return {
    primaryBranchId: rankedBranches[0]?.[0] ?? branches[0] ?? 0,
    variantAllocations,
  };
}

export function createOrder(input: {
  name: string; phone: string; email: string; fulfillment: string; branchId: number; source?: string; address?: string; distanceKm?: number | null; items: CartItemPayload[];
}) {
  return db.transaction(() => {
    const deliveryPlan = input.fulfillment === "envio" ? resolveDeliveryAllocationPlan(input.items) : null;
    const resolvedBranchId = deliveryPlan?.primaryBranchId ?? input.branchId;
    const branch = db.prepare("SELECT id FROM branches WHERE id = ?").get(resolvedBranchId);
    if (!branch) throw new Error("Sucursal inválida.");
    const source = (input.source ?? "Tienda online").trim() || "Tienda online";
    const isCashSale = source.toLowerCase().startsWith("caja");
    const status = isCashSale
      ? "Cerrado"
      : input.fulfillment === "envio"
        ? "Pendiente de envío"
        : "Pendiente de retiro";
    let totalCents = 0;
    const lines: { variantId: number; quantity: number; unitPrice: number }[] = [];
    for (const item of input.items) {
      const row = db.prepare("SELECT price_cents AS priceCents FROM variants WHERE id = ?").get(item.variantId) as { priceCents?: number } | undefined;
      if (!row || item.quantity < 1) {
        throw new Error("El stock cambió. Revisá la sucursal o la cantidad seleccionada.");
      }
      const allocations = deliveryPlan?.variantAllocations.find((entry) => entry.variantId === item.variantId)?.allocations ?? [{ branchId: resolvedBranchId, quantity: item.quantity }];
      const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (totalAllocated !== item.quantity) throw new Error("El stock cambió. Revisá la sucursal o la cantidad seleccionada.");
      const priceCents = row.priceCents ?? 0;
      totalCents += priceCents * item.quantity;
      lines.push({ variantId: item.variantId, quantity: item.quantity, unitPrice: priceCents });
    }
    const code = `AGV-${Date.now().toString().slice(-8)}`;
    const order = db.prepare(`
      INSERT INTO orders (code, customer_name, phone, email, fulfillment, delivery_address, delivery_distance_km, branch_id, total_cents, status, source, payment_method, paid_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `).run(code, input.name, input.phone, input.email, input.fulfillment, input.address ?? "", input.distanceKm ?? null, resolvedBranchId, totalCents, status, source, totalCents);
    const insertLine = db.prepare("INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)");
    const deduct = db.prepare("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ? AND branch_id = ?");
    for (const line of lines) {
      insertLine.run(order.lastInsertRowid, line.variantId, line.quantity, line.unitPrice);
      const allocations = deliveryPlan?.variantAllocations.find((entry) => entry.variantId === line.variantId)?.allocations ?? [{ branchId: resolvedBranchId, quantity: line.quantity }];
      for (const allocation of allocations) {
        deduct.run(allocation.quantity, line.variantId, allocation.branchId);
        insertOrderAllocation.run(order.lastInsertRowid, line.variantId, allocation.branchId, allocation.quantity);
      }
    }
    bumpSyncVersion();
    return { code, totalCents };
  })();
}

export function createWholesaleOrder(input: {
  clientId: number;
  branchId: number;
  paymentMethod?: string;
  paidCents?: number;
  notes?: string;
  items: { variantId: number; quantity: number; branchId: number }[];
}) {
  return db.transaction(() => {
    const client = db.prepare(`
      SELECT id, business_name AS businessName, contact_name AS contactName, phone, email, address
      FROM wholesale_clients
      WHERE id = ?
    `).get(input.clientId) as Pick<WholesaleClient, "id" | "businessName" | "contactName" | "phone" | "email" | "address"> | undefined;
    if (!client) throw new Error("Cliente inválido.");
    const primaryBranch = db.prepare("SELECT id FROM branches WHERE id = ?").get(input.branchId);
    if (!primaryBranch) throw new Error("Sucursal inválida.");
    if (!input.items.length) throw new Error("Agregá productos al pedido.");

    const merged = new Map<string, { variantId: number; branchId: number; quantity: number }>();
    for (const item of input.items) {
      if (item.quantity < 1) throw new Error("La cantidad debe ser mayor a cero.");
      const key = `${item.variantId}:${item.branchId}`;
      const current = merged.get(key) ?? { variantId: item.variantId, branchId: item.branchId, quantity: 0 };
      current.quantity += item.quantity;
      merged.set(key, current);
    }

    let totalCents = 0;
    const linesByVariant = new Map<number, { variantId: number; quantity: number; unitPrice: number; allocations: { branchId: number; quantity: number }[] }>();
    for (const item of merged.values()) {
      const row = db.prepare(`
        SELECT v.price_cents AS priceCents, i.quantity AS stock
        FROM variants v
        JOIN inventory i ON i.variant_id = v.id AND i.branch_id = ?
        WHERE v.id = ?
      `).get(item.branchId, item.variantId) as { priceCents: number; stock: number } | undefined;
      if (!row) throw new Error("Producto o sucursal inválidos.");
      if (row.stock < item.quantity) throw new Error("No hay stock suficiente para el pedido mayorista.");
      const line = linesByVariant.get(item.variantId) ?? { variantId: item.variantId, quantity: 0, unitPrice: row.priceCents, allocations: [] };
      line.quantity += item.quantity;
      line.allocations.push({ branchId: item.branchId, quantity: item.quantity });
      linesByVariant.set(item.variantId, line);
      totalCents += row.priceCents * item.quantity;
    }

    const branchTotals = new Map<number, number>();
    for (const line of linesByVariant.values()) {
      for (const allocation of line.allocations) {
        branchTotals.set(allocation.branchId, (branchTotals.get(allocation.branchId) ?? 0) + allocation.quantity);
      }
    }
    const resolvedBranchId = [...branchTotals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? input.branchId;
    const code = `MAY-${Date.now().toString().slice(-8)}`;
    const paidCents = Math.min(totalCents, Math.max(0, Math.round(input.paidCents ?? totalCents)));
    const status = paidCents >= totalCents ? "Cerrado mayorista" : "Cuenta corriente";
    const order = db.prepare(`
      INSERT INTO orders (code, customer_name, phone, email, fulfillment, delivery_address, delivery_distance_km, branch_id, total_cents, status, source, payment_method, paid_cents)
      VALUES (?, ?, ?, ?, 'Mayorista', ?, NULL, ?, ?, ?, 'Mayorista', ?, ?)
    `).run(
      code,
      client.businessName,
      client.phone || client.contactName || "Cliente mayorista",
      client.email || "mayorista@agrovet.local",
      input.notes?.trim() || client.address || "",
      resolvedBranchId,
      totalCents,
      status,
      input.paymentMethod?.trim() ?? "",
      paidCents,
    );

    const insertLine = db.prepare("INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)");
    const deduct = db.prepare("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ? AND branch_id = ?");
    for (const line of linesByVariant.values()) {
      insertLine.run(order.lastInsertRowid, line.variantId, line.quantity, line.unitPrice);
      for (const allocation of line.allocations) {
        deduct.run(allocation.quantity, line.variantId, allocation.branchId);
        insertOrderAllocation.run(order.lastInsertRowid, line.variantId, allocation.branchId, allocation.quantity);
      }
    }
    bumpSyncVersion();
    return { code, totalCents };
  })();
}

export function updateOrderPayment(input: { id: number; paidCents: number; paymentMethod?: string }) {
  db.transaction(() => {
    const order = db.prepare("SELECT id, total_cents AS totalCents, source, payment_method AS paymentMethod FROM orders WHERE id = ?").get(input.id) as { id: number; totalCents: number; source: string; paymentMethod: string } | undefined;
    if (!order) throw new Error("Pedido inválido.");
    if (!/^Mayorista\b/i.test(order.source)) throw new Error("Solo se cierran pagos mayoristas desde esta acción.");
    const paidCents = Math.min(order.totalCents, Math.max(0, Math.round(input.paidCents)));
    db.prepare("UPDATE orders SET paid_cents = ?, payment_method = ?, status = ? WHERE id = ?")
      .run(paidCents, input.paymentMethod?.trim() || order.paymentMethod || "Cuenta corriente", paidCents >= order.totalCents ? "Cerrado mayorista" : "Cuenta corriente", input.id);
    bumpSyncVersion();
  })();
}

function isCanceledStatus(status: string) {
  return /cancelad/i.test(status);
}

function readCurrentAllocations(orderId: number, fallbackBranchId: number, currentItems: Array<{ variantId: number; quantity: number }>) {
  const grouped = getAllocationBuckets(orderId);
  return currentItems.map((item) => ({
    variantId: item.variantId,
    allocations: grouped.get(item.variantId)?.length
      ? grouped.get(item.variantId)!
      : [{ branchId: fallbackBranchId, branchName: "Sucursal", quantity: item.quantity }],
  }));
}

export function updateOrder(input: {
  id: number;
  customerName: string;
  phone: string;
  email: string;
  fulfillment: string;
  branchId: number;
  deliveryAddress?: string;
  deliveryDistanceKm?: number | null;
  status: string;
  source: string;
  paymentMethod?: string;
  items: { variantId: number; quantity: number }[];
  allocations?: { variantId: number; allocations: { branchId: number; quantity: number }[] }[];
}) {
  return db.transaction(() => {
    const order = db.prepare("SELECT id, branch_id AS branchId, status, payment_method AS paymentMethod, source FROM orders WHERE id = ?").get(input.id) as { id: number; branchId: number; status: string; paymentMethod: string; source: string } | undefined;
    if (!order) throw new Error("Pedido inválido.");
    const isCashSale = /^Caja\b/i.test(order.source);
    if (isCashSale && order.branchId !== input.branchId) throw new Error("No se puede cambiar la sucursal de una venta de caja desde este panel.");
    const branch = db.prepare("SELECT id FROM branches WHERE id = ?").get(input.branchId);
    if (!branch) throw new Error("Sucursal inválida.");

    const currentItems = db.prepare(`
      SELECT variant_id AS variantId, quantity, unit_price_cents AS unitPriceCents
      FROM order_items
      WHERE order_id = ?
      ORDER BY variant_id
    `).all(input.id) as Array<{ variantId: number; quantity: number; unitPriceCents: number }>;
    if (!currentItems.length) throw new Error("El pedido no tiene productos.");

    const currentMap = new Map(currentItems.map((item) => [item.variantId, item]));
    const nextItems = input.items.map((item) => ({ variantId: item.variantId, quantity: Math.max(0, Math.round(item.quantity)) }));
    if (nextItems.length !== currentItems.length) throw new Error("No se puede agregar ni quitar productos desde esta edición.");
    for (const item of nextItems) {
      if (!currentMap.has(item.variantId)) throw new Error("No se puede cambiar la lista de productos del pedido.");
      if (item.quantity < 1) throw new Error("La cantidad de unidades debe ser al menos 1.");
    }

    let resolvedBranchId = input.branchId;
    if (input.allocations?.length) {
      const totals = new Map<number, number>();
      for (const item of input.allocations) {
        for (const allocation of item.allocations) {
          totals.set(allocation.branchId, (totals.get(allocation.branchId) ?? 0) + allocation.quantity);
        }
      }
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      if (ranked.length) resolvedBranchId = ranked[0][0];
    }

    const currentCanceled = isCanceledStatus(order.status);
    const nextCanceled = isCanceledStatus(input.status);
    const currentAllocations = readCurrentAllocations(input.id, order.branchId, currentItems);
    const nextAllocationMap = new Map<number, { branchId: number; quantity: number }[]>();
    for (const entry of currentAllocations) nextAllocationMap.set(entry.variantId, entry.allocations);
    if (input.allocations?.length) {
      for (const item of input.allocations) {
        const totalAllocated = item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        const expected = nextItems.find((nextItem) => nextItem.variantId === item.variantId)?.quantity ?? 0;
        if (totalAllocated !== expected) throw new Error("La distribución del pedido no coincide con la cantidad total de unidades.");
        nextAllocationMap.set(item.variantId, item.allocations);
      }
    }

    const inventoryDeltas = new Map<string, { variantId: number; branchId: number; delta: number }>();
    const currentAllocationBuckets = getAllocationBuckets(input.id);
    for (const item of nextItems) {
      const nextQuantity = item.quantity;
      const nextAllocations = nextAllocationMap.get(item.variantId) ?? [{ branchId: input.branchId, quantity: nextQuantity }];
      const currentAllocationsForItem = currentAllocationBuckets.get(item.variantId) ?? [{ branchId: input.branchId, branchName: "Sucursal", quantity: currentMap.get(item.variantId)?.quantity ?? nextQuantity }];
      const currentByBranch = new Map(currentAllocationsForItem.map((allocation) => [allocation.branchId, allocation.quantity]));
      const nextByBranch = new Map(nextAllocations.map((allocation) => [allocation.branchId, allocation.quantity]));
      const branchIds = new Set<number>([...currentByBranch.keys(), ...nextByBranch.keys()]);
      for (const branchId of branchIds) {
        const currentAllocated = currentByBranch.get(branchId) ?? 0;
        const nextAllocated = nextByBranch.get(branchId) ?? 0;
        let delta = 0;
        if (!currentCanceled && !nextCanceled) {
          delta = currentAllocated - nextAllocated;
        } else if (currentCanceled && !nextCanceled) {
          delta = -nextAllocated;
        } else if (!currentCanceled && nextCanceled) {
          delta = currentAllocated;
        }
        if (!delta) continue;
        const key = `${item.variantId}:${branchId}`;
        inventoryDeltas.set(key, {
          variantId: item.variantId,
          branchId,
          delta: (inventoryDeltas.get(key)?.delta ?? 0) + delta,
        });
      }
    }

    for (const delta of inventoryDeltas.values()) {
      if (delta.delta < 0) {
        const required = -delta.delta;
        const row = db.prepare("SELECT quantity FROM inventory WHERE variant_id = ? AND branch_id = ?").get(delta.variantId, delta.branchId) as { quantity?: number } | undefined;
        if ((row?.quantity ?? 0) < required) throw new Error("No hay stock suficiente para ese cambio.");
      }
    }
    for (const delta of inventoryDeltas.values()) {
      if (!delta.delta) continue;
      db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ? AND branch_id = ?")
        .run(delta.delta, delta.variantId, delta.branchId);
    }

    const totalCents = nextItems.reduce((sum, item) => sum + ((currentMap.get(item.variantId)?.unitPriceCents ?? 0) * item.quantity), 0);
    db.prepare(`
      UPDATE orders
      SET customer_name = ?, phone = ?, email = ?, fulfillment = ?, branch_id = ?,
        delivery_address = ?, delivery_distance_km = ?, status = ?, source = ?, total_cents = ?, payment_method = ?
      WHERE id = ?
    `).run(
      input.customerName.trim(),
      input.phone.trim(),
      input.email.trim(),
      input.fulfillment.trim(),
      resolvedBranchId,
      input.deliveryAddress ?? "",
      input.deliveryDistanceKm ?? null,
      input.status.trim(),
      input.source.trim(),
      totalCents,
      input.paymentMethod?.trim() ?? order.paymentMethod ?? "",
      input.id,
    );

    const deleteItems = db.prepare("DELETE FROM order_items WHERE order_id = ?");
    const insertItem = db.prepare("INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)");
    const deleteAllocations = db.prepare("DELETE FROM order_item_allocations WHERE order_id = ?");
    deleteItems.run(input.id);
    deleteAllocations.run(input.id);
    for (const item of nextItems) {
      insertItem.run(input.id, item.variantId, item.quantity, currentMap.get(item.variantId)?.unitPriceCents ?? 0);
      const nextAllocations = nextAllocationMap.get(item.variantId) ?? [{ branchId: input.branchId, quantity: item.quantity }];
      for (const allocation of nextAllocations) {
        insertOrderAllocation.run(input.id, item.variantId, allocation.branchId, allocation.quantity);
      }
    }
    bumpSyncVersion();
  })();
}

export function deleteOrder(id: number) {
  db.transaction(() => {
    const order = db.prepare("SELECT id, branch_id AS branchId, status FROM orders WHERE id = ?").get(id) as { id: number; branchId: number; status: string } | undefined;
    if (!order) return;
    const items = db.prepare("SELECT variant_id AS variantId, quantity FROM order_items WHERE order_id = ?").all(id) as Array<{ variantId: number; quantity: number }>;
    const allocations = getAllocationBuckets(id);
    const restore = db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ? AND branch_id = ?");
    if (!isCanceledStatus(order.status)) {
      for (const item of items) {
        const buckets = allocations.get(item.variantId);
        if (!buckets?.length) {
          restore.run(item.quantity, item.variantId, order.branchId);
          continue;
        }
        for (const allocation of buckets) {
          restore.run(allocation.quantity, item.variantId, allocation.branchId);
        }
      }
    }
    db.prepare("DELETE FROM orders WHERE id = ?").run(id);
    bumpSyncVersion();
  })();
}

const loginWindowMs = 1000 * 60 * 15;
const loginLockMs = 1000 * 60 * 15;
const maxLoginFailures = 5;

export function getLoginRateLimit(identifier: string) {
  const now = Date.now();
  const row = db.prepare("SELECT failures, locked_until AS lockedUntil, reset_at AS resetAt FROM admin_login_attempts WHERE identifier = ?").get(identifier) as { failures?: number; lockedUntil?: number; resetAt?: number } | undefined;
  if (!row) return { limited: false, retryAfterSeconds: 0 };
  if ((row.resetAt ?? 0) <= now && (row.lockedUntil ?? 0) <= now) {
    db.prepare("DELETE FROM admin_login_attempts WHERE identifier = ?").run(identifier);
    return { limited: false, retryAfterSeconds: 0 };
  }
  if ((row.lockedUntil ?? 0) > now) {
    return { limited: true, retryAfterSeconds: Math.ceil(((row.lockedUntil ?? 0) - now) / 1000) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export function recordLoginAttempt(identifier: string, success: boolean) {
  if (success) {
    db.prepare("DELETE FROM admin_login_attempts WHERE identifier = ?").run(identifier);
    return;
  }
  const now = Date.now();
  const current = db.prepare("SELECT failures, locked_until AS lockedUntil, reset_at AS resetAt FROM admin_login_attempts WHERE identifier = ?").get(identifier) as { failures?: number; lockedUntil?: number; resetAt?: number } | undefined;
  const bucket = current && (current.resetAt ?? 0) > now
    ? current
    : { failures: 0, lockedUntil: 0, resetAt: now + loginWindowMs };
  const failures = (bucket.failures ?? 0) + 1;
  const lockedUntil = failures >= maxLoginFailures ? now + loginLockMs : (bucket.lockedUntil ?? 0);
  const resetAt = failures >= maxLoginFailures ? lockedUntil : (bucket.resetAt ?? now + loginWindowMs);
  db.prepare(`
    INSERT INTO admin_login_attempts (identifier, failures, locked_until, reset_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(identifier) DO UPDATE SET
      failures = excluded.failures,
      locked_until = excluded.locked_until,
      reset_at = excluded.reset_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(identifier, failures, lockedUntil, resetAt);
}

