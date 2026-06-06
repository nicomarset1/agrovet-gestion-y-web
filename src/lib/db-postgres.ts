import "server-only";

import postgres from "postgres";
import { getSpecialCategoryHref, isSpecialCategorySlug, specialCategories } from "./special-categories";
import type { Branch, CartItemPayload, CatalogFilters, CatalogMenuNode, Category, LowStockItem, OrderRecord, Product, SearchIndexItem, TrashItem, Variant, WholesaleClient } from "./types";

const uncategorizedSubcategorySlug = "sin-subcategoria";
const uncategorizedSubcategoryName = "Sin subcategorÃ­a";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the Postgres data layer.");
}

const sql = postgres(databaseUrl, {
  max: 10,
  ssl: {
    rejectUnauthorized: false,
  },
});

type Db = typeof sql | postgres.TransactionSql<Record<string, never>>;
let initialized: Promise<void> | null = null;

const branchSeed = [
  { id: 1, slug: "independencia", name: "Sucursal Independencia", address: "Av. Independencia 2599, Mar del Plata", phone: "0223 493-5665", mapUrl: "", verified: true },
  { id: 2, slug: "belgrano", name: "Sucursal Belgrano", address: "Belgrano 3898, Mar del Plata", phone: "0223 496-3388", mapUrl: "https://maps.app.goo.gl/i6qdpBif69yS3WKD9", verified: true },
];

const categorySeed = [
  { id: 1, slug: "alimentos", name: "Alimentos", description: "NutriciÃ³n diaria y alimentos especializados.", showInMenu: false },
  { id: 2, slug: "farmacia", name: "Farmacia", description: "Antiparasitarios, tratamiento y cuidado veterinario.", showInMenu: false },
  { id: 3, slug: "accesorios", name: "Accesorios", description: "Paseo, descanso, comederos y complementos.", showInMenu: false },
  { id: 4, slug: "higiene", name: "Higiene y sanitario", description: "Cuidado, limpieza y productos sanitarios.", showInMenu: false },
  { id: 5, slug: "perro", name: "Perro", description: "Productos y categorÃ­as para perros.", showInMenu: true },
  { id: 6, slug: "gato", name: "Gato", description: "Productos y categorÃ­as para gatos.", showInMenu: true },
];

const specialCategorySeed = specialCategories.map((category, index) => ({
  id: 1001 + index,
  slug: category.slug,
  name: category.name,
  description: "PÃ¡gina especial del sitio.",
}));

const productSeed = [
  { id: 1, slug: "royal-canin-mini-adult", name: "Mini Adult", brand: "Royal Canin", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "pequeÃ±o", need: "", description: "Alimento seco para perros adultos de talla pequeÃ±a.", featured: true, requiresAdvice: false, color: "#f3b52e", imageUrl: "" },
  { id: 2, slug: "pro-plan-adult-sensitive", name: "Adult Sensitive Skin", brand: "Purina Pro Plan", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "mediano", need: "piel-sensible", description: "NutriciÃ³n completa para perros adultos con piel sensible.", featured: true, requiresAdvice: false, color: "#173c68", imageUrl: "" },
  { id: 3, slug: "excellent-gato-adulto", name: "Gato Adulto Pollo y Arroz", brand: "Excellent", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento balanceado completo para gatos adultos.", featured: true, requiresAdvice: false, color: "#da7134", imageUrl: "" },
  { id: 4, slug: "old-prince-cordero", name: "Cordero y Arroz Adulto", brand: "Old Prince", categoryId: 1, species: "perro", subcategorySlug: "perro-secos", subcategoryName: "Perro / Alimentos secos", lifeStage: "adulto", size: "mediano", need: "", description: "FÃ³rmula premium para perros adultos.", featured: false, requiresAdvice: false, color: "#7c432e", imageUrl: "" },
  { id: 5, slug: "bravecto-perro", name: "Bravecto Comprimido", brand: "MSD", categoryId: 2, species: "perro", subcategorySlug: "perro-parasitos", subcategoryName: "Perro / Antiparasitarios", lifeStage: "adulto", size: "todos", need: "antiparasitario", description: "Antiparasitario externo. Administrar bajo indicaciÃ³n profesional.", featured: true, requiresAdvice: true, color: "#7c3aed", imageUrl: "" },
  { id: 6, slug: "pipeta-bravecto-gato", name: "Pipeta Bravecto Gato", brand: "MSD", categoryId: 2, species: "gato", subcategorySlug: "gato-parasitos", subcategoryName: "Gato / Antiparasitarios", lifeStage: "adulto", size: "todos", need: "antiparasitario", description: "Pipeta antipulgas para gatos segÃºn rango de peso.", featured: false, requiresAdvice: true, color: "#7452ac", imageUrl: "" },
  { id: 7, slug: "pretal-confort", name: "Pretal Confort Regulable", brand: "Agrovet Select", categoryId: 3, species: "perro", subcategorySlug: "paseo", subcategoryName: "Paseo y seguridad", lifeStage: "", size: "todos", need: "", description: "Pretal acolchado con ajuste seguro y argolla reforzada.", featured: true, requiresAdvice: false, color: "#5b0f73", imageUrl: "" },
  { id: 8, slug: "rascador-madera", name: "Rascador Torre Compacta", brand: "Agrovet Select", categoryId: 3, species: "gato", subcategorySlug: "gato-hogar", subcategoryName: "Gato / Descanso y juego", lifeStage: "", size: "todos", need: "", description: "Rascador de sisal con plataforma de descanso.", featured: false, requiresAdvice: false, color: "#c28253", imageUrl: "" },
  { id: 9, slug: "comedero-acero", name: "Comedero Acero Inoxidable", brand: "Trixie", categoryId: 3, species: "perro-gato", subcategorySlug: "comedores", subcategoryName: "Comederos y bebederos", lifeStage: "", size: "todos", need: "", description: "Base antideslizante y recipiente lavable.", featured: false, requiresAdvice: false, color: "#71889d", imageUrl: "" },
  { id: 10, slug: "piedras-sanitarias", name: "Piedras Sanitarias Premium", brand: "Absorsol", categoryId: 4, species: "gato", subcategorySlug: "gato-sanitario", subcategoryName: "Gato / Sanitario", lifeStage: "", size: "todos", need: "", description: "Alta absorciÃ³n y control de olores.", featured: true, requiresAdvice: false, color: "#53a397", imageUrl: "" },
  { id: 11, slug: "shampoo-hipoalergenico", name: "Shampoo Hipoalergenico", brand: "Osspret", categoryId: 4, species: "perro-gato", subcategorySlug: "higiene", subcategoryName: "Higiene y cuidado", lifeStage: "", size: "todos", need: "piel-sensible", description: "Limpieza suave para pieles sensibles.", featured: false, requiresAdvice: false, color: "#3a92b1", imageUrl: "" },
  { id: 12, slug: "vitalcan-balanced-puppy", name: "Balanced Puppy", brand: "Vitalcan", categoryId: 1, species: "perro", subcategorySlug: "cachorros", subcategoryName: "Perro / Cachorros", lifeStage: "cachorro", size: "mediano", need: "", description: "NutriciÃ³n para cachorros en etapa de crecimiento.", featured: false, requiresAdvice: false, color: "#6f9c3f", imageUrl: "" },
  { id: 13, slug: "eukanuba-cat-adult", name: "Cat Adult", brand: "Eukanuba", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "NutriciÃ³n diaria para gatos adultos con alta palatabilidad.", featured: true, requiresAdvice: false, color: "#6b4e8b", imageUrl: "" },
  { id: 14, slug: "eukanuba-cat-kitten", name: "Cat Kitten", brand: "Eukanuba", categoryId: 1, species: "gato", subcategorySlug: "gato-cachorros", subcategoryName: "Gato / Cachorros", lifeStage: "cachorro", size: "todos", need: "", description: "Alimento completo para gatitos en crecimiento.", featured: false, requiresAdvice: false, color: "#8c6bb0", imageUrl: "" },
  { id: 15, slug: "vitalcan-balanced-cat-adult", name: "Balanced Cat Adult", brand: "Vitalcan", categoryId: 1, species: "gato", subcategorySlug: "gato-secos", subcategoryName: "Gato / Alimentos secos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento seco para gatos adultos con buen equilibrio nutricional.", featured: true, requiresAdvice: false, color: "#7c3aed", imageUrl: "" },
  { id: 16, slug: "cat-it-creamy-multipack", name: "Cat It Creamy Multipack", brand: "Catit", categoryId: 1, species: "gato", subcategorySlug: "gato-snacks", subcategoryName: "Gato / Golosinas y snacks", lifeStage: "adulto", size: "todos", need: "", description: "Snack cremoso para premiar y complementar la dieta.", featured: false, requiresAdvice: false, color: "#d68d55", imageUrl: "" },
  { id: 17, slug: "royal-canin-feline-urinary", name: "Feline Urinary S/O", brand: "Royal Canin", categoryId: 1, species: "gato", subcategorySlug: "gato-terapeuticos", subcategoryName: "Gato / TerapÃ©uticos", lifeStage: "adulto", size: "todos", need: "urinario", description: "Formula veterinaria para soporte urinario felino.", featured: true, requiresAdvice: true, color: "#4f77a8", imageUrl: "" },
  { id: 18, slug: "lata-vitalcan-cat-adult-salsa", name: "Cat Adult Carne en Salsa", brand: "Vitalcan", categoryId: 1, species: "gato", subcategorySlug: "gato-humedos", subcategoryName: "Gato / Alimentos hÃºmedos", lifeStage: "adulto", size: "todos", need: "", description: "Alimento humedo completo para gatos adultos.", featured: false, requiresAdvice: false, color: "#9e5f40", imageUrl: "" },
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

async function ensureSchema() {
  initialized ??= (async () => {
    await sql.begin(async (schemaTx) => {
      await schemaTx`SELECT pg_advisory_xact_lock(742060606)`;
      await schemaTx.unsafe(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO app_meta (key, value) VALUES ('sync_version', 0)
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        map_url TEXT NOT NULL DEFAULT '',
        verified BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        show_in_menu BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
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
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        requires_advice BOOLEAN NOT NULL DEFAULT FALSE,
        color TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT '',
        archived_at TIMESTAMPTZ,
        purged_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS variants (
        id SERIAL PRIMARY KEY,
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (variant_id, branch_id)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        fulfillment TEXT NOT NULL,
        delivery_address TEXT NOT NULL DEFAULT '',
        delivery_distance_km DOUBLE PRECISION,
        branch_id INTEGER NOT NULL REFERENCES branches(id),
        total_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendiente de confirmaciÃ³n',
        source TEXT NOT NULL DEFAULT 'Tienda online',
        payment_method TEXT NOT NULL DEFAULT '',
        paid_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
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
        id SERIAL PRIMARY KEY,
        business_name TEXT NOT NULL,
        contact_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        tax_id TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        identifier TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until BIGINT NOT NULL DEFAULT 0,
        reset_at BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
      CREATE INDEX IF NOT EXISTS products_subcategory_idx ON products(subcategory_slug);
      CREATE INDEX IF NOT EXISTS products_featured_idx ON products(featured);
      CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);
      CREATE INDEX IF NOT EXISTS inventory_branch_idx ON inventory(branch_id);
      CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS admin_login_attempts_locked_idx ON admin_login_attempts(locked_until);
    `);

      await schemaTx`ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
      await schemaTx`ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
      await schemaTx`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
      await schemaTx`ALTER TABLE wholesale_clients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
      await schemaTx`ALTER TABLE products ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ`;

      const [seedCheck] = await schemaTx`SELECT COUNT(*)::int AS count FROM branches`;
      if (Number(seedCheck.count) === 0) {
        const tx = schemaTx;
        for (const branch of branchSeed) {
          await tx`
            INSERT INTO branches (id, slug, name, address, phone, map_url, verified)
            VALUES (${branch.id}, ${branch.slug}, ${branch.name}, ${branch.address}, ${branch.phone}, ${branch.mapUrl}, ${branch.verified})
            ON CONFLICT (id) DO UPDATE SET
              slug = EXCLUDED.slug,
              name = EXCLUDED.name,
              address = EXCLUDED.address,
              phone = EXCLUDED.phone,
              map_url = EXCLUDED.map_url,
              verified = EXCLUDED.verified
          `;
        }
        for (const category of categorySeed) {
          await tx`
            INSERT INTO categories (id, slug, name, description, parent_category_id, show_in_menu)
            VALUES (${category.id}, ${category.slug}, ${category.name}, ${category.description}, NULL, ${category.showInMenu})
            ON CONFLICT (id) DO UPDATE SET
              slug = EXCLUDED.slug,
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              parent_category_id = NULL,
              show_in_menu = EXCLUDED.show_in_menu
          `;
        }
        for (const category of specialCategorySeed) {
          await tx`
            INSERT INTO categories (id, slug, name, description, parent_category_id, show_in_menu)
            VALUES (${category.id}, ${category.slug}, ${category.name}, ${category.description}, NULL, TRUE)
            ON CONFLICT (slug) DO UPDATE SET
              description = EXCLUDED.description,
              parent_category_id = NULL,
              show_in_menu = TRUE
          `;
        }
        for (const subcategory of subcategorySeed) {
          await tx`
            INSERT INTO subcategories (slug, category_id, name, description)
            VALUES (${subcategory.slug}, ${subcategory.categoryId}, ${subcategory.name}, ${subcategory.description})
            ON CONFLICT (slug) DO UPDATE SET
              category_id = EXCLUDED.category_id,
              name = EXCLUDED.name,
              description = EXCLUDED.description
          `;
        }
        for (const product of productSeed) {
          await tx`
            INSERT INTO products (
              id, slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
              description, featured, requires_advice, color, image_url, archived_at
            ) VALUES (
              ${product.id}, ${product.slug}, ${product.name}, ${product.brand}, ${product.categoryId}, ${product.species}, ${product.subcategorySlug},
              ${product.subcategoryName}, ${product.lifeStage}, ${product.size}, ${product.need}, ${product.description},
              ${product.featured}, ${product.requiresAdvice}, ${product.color}, ${product.imageUrl}, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
              slug = EXCLUDED.slug,
              name = EXCLUDED.name,
              brand = EXCLUDED.brand,
              category_id = EXCLUDED.category_id,
              species = EXCLUDED.species,
              subcategory_slug = EXCLUDED.subcategory_slug,
              subcategory_name = EXCLUDED.subcategory_name,
              life_stage = EXCLUDED.life_stage,
              size = EXCLUDED.size,
              need = EXCLUDED.need,
              description = EXCLUDED.description,
              featured = EXCLUDED.featured,
              requires_advice = EXCLUDED.requires_advice,
              color = EXCLUDED.color,
              image_url = EXCLUDED.image_url
          `;
        }
        for (const variant of variantSeed) {
          const [id, productId, label, sku, priceCents] = variant;
          await tx`
            INSERT INTO variants (id, product_id, label, sku, barcode, price_cents)
            VALUES (${id}, ${productId}, ${label}, ${sku}, ${sku}, ${priceCents})
            ON CONFLICT (id) DO UPDATE SET
              product_id = EXCLUDED.product_id,
              label = EXCLUDED.label,
              sku = EXCLUDED.sku,
              barcode = EXCLUDED.barcode,
              price_cents = EXCLUDED.price_cents
          `;
        }
        for (const variant of variantSeed) {
          const [id, , , , , branch1, branch2] = variant;
          await tx`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES (${id}, 1, ${branch1})
            ON CONFLICT (variant_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
          `;
          await tx`
            INSERT INTO inventory (variant_id, branch_id, quantity)
            VALUES (${id}, 2, ${branch2})
            ON CONFLICT (variant_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
          `;
        }
        await tx`UPDATE app_meta SET value = 0 WHERE key = 'sync_version'`;
      }
    });
  })();
  await initialized;
}

async function bumpSyncVersion(db: Db = sql) {
  await db`UPDATE app_meta SET value = value + 1 WHERE key = 'sync_version'`;
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

export async function getSyncVersion() {
  await ensureSchema();
  const [row] = await sql`SELECT value FROM app_meta WHERE key = 'sync_version'`;
  return Number(row?.value ?? 0);
}

type ProductRow = {
  id: number; slug: string; name: string; brand: string; category: string; categorySlug: string;
  subcategory: string; subcategorySlug: string; species: Product["species"]; lifeStage: string; size: string; need: string;
  description: string; featured: boolean; requiresAdvice: boolean; color: string; imageUrl: string;
};

type VariantRow = {
  id: number; label: string; sku: string; barcode: string; priceCents: number; branchId: number; branchName: string;
  quantity: number;
};

// Carga variantes + stock de varios productos en UNA sola query (evita el N+1 de
// disparar una consulta por producto). El orden por product_id, price_cents, b.id
// preserva el mismo orden de variantes/stocks que la query individual previa.
async function buildVariantsByProduct(productIds: number[], db: Db = sql): Promise<Map<number, Variant[]>> {
  const result = new Map<number, Variant[]>();
  if (!productIds.length) return result;
  const rows = await db`
    SELECT v.product_id AS "productId", v.id, v.label, v.sku, v.barcode, v.price_cents AS "priceCents",
      b.id AS "branchId", b.name AS "branchName", i.quantity
    FROM variants v
    JOIN inventory i ON i.variant_id = v.id
    JOIN branches b ON b.id = i.branch_id
    WHERE v.product_id = ANY(${productIds})
    ORDER BY v.product_id, v.price_cents, b.id
  ` as unknown as (VariantRow & { productId: number })[];
  const grouped = new Map<number, Map<number, Variant>>();
  for (const row of rows) {
    let variants = grouped.get(row.productId);
    if (!variants) { variants = new Map(); grouped.set(row.productId, variants); }
    const current = variants.get(row.id) ?? {
      id: row.id,
      label: row.label,
      sku: row.sku,
      barcode: row.barcode,
      priceCents: Number(row.priceCents),
      stocks: [],
      totalStock: 0,
    };
    current.stocks.push({ branchId: row.branchId, branchName: row.branchName, quantity: Number(row.quantity) });
    current.totalStock += Number(row.quantity);
    variants.set(row.id, current);
  }
  for (const [productId, variants] of grouped) result.set(productId, [...variants.values()]);
  return result;
}

function toProduct(row: ProductRow, variants: Variant[]): Product {
  return { ...row, featured: Boolean(row.featured), requiresAdvice: Boolean(row.requiresAdvice), variants };
}

async function hydrateProducts(rows: ProductRow[], db: Db = sql): Promise<Product[]> {
  const byProduct = await buildVariantsByProduct(rows.map((row) => row.id), db);
  return rows.map((row) => toProduct(row, byProduct.get(row.id) ?? []));
}

async function hydrateProduct(row: ProductRow, db: Db = sql): Promise<Product> {
  const byProduct = await buildVariantsByProduct([row.id], db);
  return toProduct(row, byProduct.get(row.id) ?? []);
}

const specialCategoryOrderSql = specialCategories
  .map((category, index) => `WHEN '${category.slug.replaceAll("'", "''")}' THEN ${index}`)
  .join(" ");

const baseSelect = `
  SELECT p.id, p.slug, p.name, p.brand, COALESCE(c.name, 'Sin categorÃ­a') AS category, COALESCE(c.slug, '') AS "categorySlug",
    COALESCE(NULLIF(p.subcategory_name, ''), '${uncategorizedSubcategoryName}') AS subcategory,
    COALESCE(NULLIF(p.subcategory_slug, ''), '${uncategorizedSubcategorySlug}') AS "subcategorySlug",
    p.species, p.life_stage AS "lifeStage", p.size, p.need, p.description, p.featured,
    p.requires_advice AS "requiresAdvice", p.color, p.image_url AS "imageUrl"
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
  LEFT JOIN categories pc ON pc.id = c.parent_category_id AND pc.deleted_at IS NULL
`;

function values(input?: string | string[]) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean);
}

function pushParam(params: unknown[], value: unknown) {
  params.push(value);
  return `$${params.length}`;
}

function addInClause(clauses: string[], params: unknown[], expression: string, input?: string | string[]) {
  const selected = values(input);
  if (!selected.length) return;
  clauses.push(`${expression} IN (${selected.map((item) => pushParam(params, item)).join(", ")})`);
}

export async function getProducts(filters: CatalogFilters = {}) {
  await ensureSchema();
  const clauses: string[] = ["p.archived_at IS NULL", "p.purged_at IS NULL"];
  const params: unknown[] = [];
  if (filters.q) {
    const value = `%${filters.q}%`;
    clauses.push(`(p.name ILIKE ${pushParam(params, value)} OR p.brand ILIKE ${pushParam(params, value)} OR p.description ILIKE ${pushParam(params, value)})`);
  }
  const categories = values(filters.category);
  if (categories.length) {
    const direct = categories.map((item) => pushParam(params, item)).join(", ");
    const parent = categories.map((item) => pushParam(params, item)).join(", ");
    clauses.push(`(c.slug IN (${direct}) OR pc.slug IN (${parent}))`);
  }
  addInClause(clauses, params, "p.subcategory_slug", filters.subcategory);
  if (filters.pet && filters.pet !== "todos") {
    clauses.push(`(p.species = ${pushParam(params, filters.pet)} OR p.species = 'perro-gato')`);
  }
  addInClause(clauses, params, "p.brand", filters.brand);
  addInClause(clauses, params, "p.life_stage", filters.stage);
  const sizes = values(filters.size);
  if (sizes.length) {
    clauses.push(`(p.size IN (${sizes.map((item) => pushParam(params, item)).join(", ")}) OR p.size = 'todos')`);
  }
  const needs = values(filters.need);
  if (needs.length) {
    clauses.push(`(p.need IN (${needs.map((item) => pushParam(params, item)).join(", ")}) OR p.need = '')`);
  }
  const presentations = values(filters.presentation);
  if (presentations.length) {
    clauses.push(`EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND (${presentations.map((presentation) => `vx.label ILIKE ${pushParam(params, `%${presentation}%`)}`).join(" OR ")}))`);
  }
  if (filters.minPrice) {
    const cents = Math.round(Number(filters.minPrice) * 100);
    if (Number.isFinite(cents)) clauses.push(`EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND vx.price_cents >= ${pushParam(params, cents)})`);
  }
  if (filters.maxPrice) {
    const cents = Math.round(Number(filters.maxPrice) * 100);
    if (Number.isFinite(cents)) clauses.push(`EXISTS (SELECT 1 FROM variants vx WHERE vx.product_id = p.id AND vx.price_cents <= ${pushParam(params, cents)})`);
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
  const rows = await sql.unsafe(`${baseSelect} WHERE ${clauses.join(" AND ")} ${orderBy}`, params as never[]) as unknown as ProductRow[];
  return hydrateProducts(rows);
}

export async function getProduct(slug: string) {
  await ensureSchema();
  const rows = await sql.unsafe(`${baseSelect} WHERE p.slug = $1 AND p.archived_at IS NULL AND p.purged_at IS NULL`, [slug] as never[]) as unknown as ProductRow[];
  return rows[0] ? hydrateProduct(rows[0]) : undefined;
}

export async function getFeaturedProducts() {
  await ensureSchema();
  // Filtra y limita en la DB en vez de hidratar todo el catálogo para quedarse con 4.
  const rows = await sql.unsafe(`${baseSelect} WHERE p.featured = TRUE AND p.archived_at IS NULL AND p.purged_at IS NULL ORDER BY p.name LIMIT 4`, [] as never[]) as unknown as ProductRow[];
  return hydrateProducts(rows);
}

const defaultLowStockThreshold = 5;

export async function getLowStockThreshold(): Promise<number> {
  await ensureSchema();
  const [row] = await sql`SELECT value FROM app_meta WHERE key = 'low_stock_threshold'`;
  return row && Number.isFinite(Number(row.value)) ? Number(row.value) : defaultLowStockThreshold;
}

export async function setLowStockThreshold(value: number) {
  await ensureSchema();
  await sql`INSERT INTO app_meta (key, value) VALUES ('low_stock_threshold', ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

// Variantes con stock por sucursal <= umbral. Cada fila incluye la "mejor" otra sucursal
// (donor) para sugerir un traslado, vía subconsultas (sin N+1).
export async function getLowStockItems(threshold: number): Promise<LowStockItem[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT v.id AS "variantId", p.id AS "productId", p.name AS "productName", p.slug AS "productSlug",
      v.label, v.sku, b.id AS "branchId", b.name AS "branchName", i.quantity,
      (SELECT i2.branch_id FROM inventory i2 WHERE i2.variant_id = v.id AND i2.branch_id <> b.id ORDER BY i2.quantity DESC LIMIT 1) AS "donorBranchId",
      (SELECT b2.name FROM inventory i2 JOIN branches b2 ON b2.id = i2.branch_id WHERE i2.variant_id = v.id AND i2.branch_id <> b.id ORDER BY i2.quantity DESC LIMIT 1) AS "donorBranchName",
      (SELECT MAX(i2.quantity) FROM inventory i2 WHERE i2.variant_id = v.id AND i2.branch_id <> b.id) AS "donorQuantity"
    FROM inventory i
    JOIN variants v ON v.id = i.variant_id
    JOIN products p ON p.id = v.product_id
    JOIN branches b ON b.id = i.branch_id
    WHERE i.quantity <= ${threshold} AND p.archived_at IS NULL AND p.purged_at IS NULL
    ORDER BY i.quantity ASC, p.name, v.label
  ` as unknown as LowStockItem[];
  return rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    donorBranchId: row.donorBranchId === null ? null : Number(row.donorBranchId),
    donorQuantity: row.donorQuantity === null ? null : Number(row.donorQuantity),
  }));
}

export async function getCategories() {
  await ensureSchema();
  const specialSlugs = specialCategories.map((category) => `'${category.slug.replaceAll("'", "''")}'`).join(", ");
  const rows = await sql.unsafe(`
    SELECT c.id, c.slug, c.name, c.description, c.show_in_menu AS "showInMenu",
      c.parent_category_id AS "parentCategoryId",
      p.slug AS "parentCategorySlug",
      p.name AS "parentCategoryName"
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_category_id
    WHERE c.deleted_at IS NULL
    ORDER BY
      CASE WHEN c.slug IN (${specialSlugs}) THEN 1 ELSE 0 END,
      CASE WHEN c.slug IN (${specialSlugs}) THEN CASE c.slug ${specialCategoryOrderSql} ELSE 999 END ELSE COALESCE(p.id, c.id) END,
      c.parent_category_id IS NOT NULL,
      c.name
  `) as unknown as Category[];
  return rows.map((row) => ({ ...row, showInMenu: Boolean(row.showInMenu) }));
}

export async function getSubcategories() {
  await ensureSchema();
  return await sql`
    SELECT s.slug AS slug, s.name AS name, s.description AS description,
      c.id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName", COUNT(p.id)::int AS count
    FROM subcategories s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN products p ON p.subcategory_slug = s.slug AND p.archived_at IS NULL AND p.purged_at IS NULL
    WHERE s.deleted_at IS NULL
    GROUP BY s.slug, s.name, s.description, c.id, c.slug, c.name
    ORDER BY COALESCE(c.name, 'Sin categorÃ­a'), s.name
  ` as unknown as { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null; count: number }[];
}

export async function getSubcategoryBySlug(slug: string, db: Db = sql) {
  await ensureSchema();
  const [row] = await db`
    SELECT s.slug AS slug, s.name AS name, s.description AS description,
      c.id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName"
    FROM subcategories s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.slug = ${slug} AND s.deleted_at IS NULL
  ` as unknown as { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null }[];
  return row;
}

export async function getBranches() {
  await ensureSchema();
  const rows = await sql`SELECT id, slug, name, address, phone, map_url AS "mapUrl", verified FROM branches ORDER BY id` as unknown as Branch[];
  return rows.map((row) => ({ ...row, verified: Boolean(row.verified) }));
}

export async function getWholesaleClients(): Promise<WholesaleClient[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT id, business_name AS "businessName", contact_name AS "contactName", phone, email,
      address, tax_id AS "taxId", notes, created_at AS "createdAt"
    FROM wholesale_clients
    WHERE deleted_at IS NULL
    ORDER BY LOWER(business_name)
  ` as unknown as Array<Omit<WholesaleClient, "createdAt"> & { createdAt: unknown }>;
  return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) }));
}

export async function createWholesaleClient(input: {
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
}) {
  await ensureSchema();
  const [row] = await sql`
    INSERT INTO wholesale_clients (business_name, contact_name, phone, email, address, tax_id, notes)
    VALUES (${input.businessName.trim()}, ${input.contactName?.trim() ?? ""}, ${input.phone?.trim() ?? ""}, ${input.email?.trim() ?? ""}, ${input.address?.trim() ?? ""}, ${input.taxId?.trim() ?? ""}, ${input.notes?.trim() ?? ""})
    RETURNING id
  `;
  await bumpSyncVersion();
  return Number(row.id);
}

export async function updateWholesaleClient(input: WholesaleClient) {
  await ensureSchema();
  await sql`
    UPDATE wholesale_clients
    SET business_name = ${input.businessName.trim()}, contact_name = ${input.contactName.trim()}, phone = ${input.phone.trim()},
      email = ${input.email.trim()}, address = ${input.address.trim()}, tax_id = ${input.taxId.trim()}, notes = ${input.notes.trim()}
    WHERE id = ${input.id}
  `;
  await bumpSyncVersion();
}

export async function deleteWholesaleClient(id: number) {
  await ensureSchema();
  await sql`UPDATE wholesale_clients SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
  await bumpSyncVersion();
}

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

async function getAllocationBuckets(orderId: number, db: Db = sql) {
  const rows = await db`
    SELECT oa.order_id AS "orderId", oa.variant_id AS "variantId", oa.branch_id AS "branchId",
      b.name AS "branchName", oa.quantity
    FROM order_item_allocations oa
    JOIN branches b ON b.id = oa.branch_id
    WHERE oa.order_id = ${orderId}
    ORDER BY oa.variant_id, oa.branch_id
  ` as unknown as OrderAllocationRow[];
  const byVariant = new Map<number, OrderItemAllocation[]>();
  for (const row of rows) {
    const current = byVariant.get(row.variantId) ?? [];
    current.push({ branchId: row.branchId, branchName: row.branchName, quantity: Number(row.quantity) });
    byVariant.set(row.variantId, current);
  }
  return byVariant;
}

async function mapAdminOrders(): Promise<OrderRecord[]> {
  const orders = await sql`
    SELECT o.id, o.code, o.customer_name AS "customerName", o.phone, o.email, o.fulfillment,
      o.delivery_address AS "deliveryAddress", o.delivery_distance_km AS "deliveryDistanceKm",
      o.branch_id AS "branchId", b.name AS "branchName", o.total_cents AS "totalCents", o.status,
      o.source, o.payment_method AS "paymentMethod", o.paid_cents AS "paidCents", o.created_at AS "createdAt"
    FROM orders o
    JOIN branches b ON b.id = o.branch_id
    WHERE o.deleted_at IS NULL
    ORDER BY o.created_at DESC, o.id DESC
  ` as unknown as Array<Omit<OrderRecord, "itemCount" | "items" | "createdAt"> & { createdAt: unknown }>;
  if (!orders.length) return [];
  const items = await sql`
    SELECT oi.order_id AS "orderId", oi.variant_id AS "variantId", p.name AS "productName", p.brand,
      v.label, v.sku, oi.quantity, oi.unit_price_cents AS "unitPriceCents"
    FROM order_items oi
    JOIN variants v ON v.id = oi.variant_id
    JOIN products p ON p.id = v.product_id
    ORDER BY oi.order_id DESC, p.brand, p.name, v.label
  ` as unknown as Array<{ orderId: number; variantId: number; productName: string; brand: string; label: string; sku: string; quantity: number; unitPriceCents: number }>;
  const allocationRows = await sql`
    SELECT oa.order_id AS "orderId", oa.variant_id AS "variantId", oa.branch_id AS "branchId",
      b.name AS "branchName", oa.quantity
    FROM order_item_allocations oa
    JOIN branches b ON b.id = oa.branch_id
    ORDER BY oa.order_id DESC, oa.variant_id, oa.branch_id
  ` as unknown as OrderAllocationRow[];
  const allocationBuckets = new Map<number, Map<number, OrderItemAllocation[]>>();
  for (const row of allocationRows) {
    const orderBuckets = allocationBuckets.get(row.orderId) ?? new Map<number, OrderItemAllocation[]>();
    const current = orderBuckets.get(row.variantId) ?? [];
    current.push({ branchId: row.branchId, branchName: row.branchName, quantity: Number(row.quantity) });
    orderBuckets.set(row.variantId, current);
    allocationBuckets.set(row.orderId, orderBuckets);
  }
  const itemsByOrder = new Map<number, OrderRecord["items"]>();
  for (const item of items) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    const allocations = allocationBuckets.get(item.orderId)?.get(item.variantId) ?? [];
    current.push({
      variantId: item.variantId,
      productName: item.productName,
      brand: item.brand,
      label: item.label,
      sku: item.sku,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unitPriceCents),
      allocations: allocations.length ? allocations : undefined,
    });
    itemsByOrder.set(item.orderId, current);
  }
  return orders.map((order) => ({
    ...order,
    totalCents: Number(order.totalCents),
    paidCents: Number(order.paidCents ?? order.totalCents),
    createdAt: toIso(order.createdAt),
    itemCount: itemsByOrder.get(order.id)?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

export async function getAdminSnapshot() {
  await ensureSchema();
  const [products, branches, orders, wholesaleClients] = await Promise.all([getProducts(), getBranches(), mapAdminOrders(), getWholesaleClients()]);
  return { products, branches, orders, wholesaleClients };
}

export async function getCatalogFacets() {
  const products = await getProducts();
  const allCategories = await getCategories();
  const allSubcategories = await getSubcategories();
  const facetCategories = allCategories.filter((category) => !isSpecialCategorySlug(category.slug));
  const categoriesBySlug = new Map(facetCategories.map((category) => [category.slug, category]));
  const categories = new Map<string, { name: string; count: number; subcategories: Map<string, { name: string; count: number }> }>();
  for (const category of facetCategories) categories.set(category.slug, { name: category.name, count: 0, subcategories: new Map() });
  for (const subcategory of allSubcategories) {
    if (!subcategory.categorySlug) continue;
    categories.get(subcategory.categorySlug)?.subcategories.set(subcategory.slug, { name: subcategory.name, count: 0 });
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
    categories: [...categories.entries()]
      .filter(([, value]) => value.count > 0)
      .map(([slug, value]) => ({
        slug,
        ...value,
        subcategories: [...value.subcategories.entries()]
          .filter(([, subValue]) => subValue.count > 0)
          .map(([subSlug, subValue]) => ({ slug: subSlug, ...subValue })),
      })),
    brands: [...brands.entries()].map(([name, count]) => ({ name, count })),
    lifeStages: [...lifeStages.entries()].map(([name, count]) => ({ name, count })),
    sizes: [...sizes.entries()].map(([name, count]) => ({ name, count })),
    needs: [...needs.entries()].map(([name, count]) => ({ name, count })),
    species: [...species.entries()].map(([name, count]) => ({ name, count })),
    presentations: [...presentations.entries()].map(([name, count]) => ({ name, count })),
    priceRange: { min: Number.isFinite(minPrice) ? minPrice : 0, max: maxPrice },
  };
}

export async function getSearchIndex(): Promise<SearchIndexItem[]> {
  return (await getProducts()).map((product) => {
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

export async function getCatalogMenu(): Promise<CatalogMenuNode[]> {
  const products = await getProducts();
  const categories = await getCategories();
  const subcategories = await getSubcategories();
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
  const rootCategories = new Set(categories.filter((category) => category.showInMenu).map((category) => category.slug));
  const rootFor = (categorySlug?: string | null) => categorySlug ? categoriesBySlug.get(categorySlug)?.parentCategorySlug ?? categorySlug : "";
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
  for (const category of categories.filter((item) => item.showInMenu && !item.parentCategoryId)) rootCategoryMap.set(category.slug, { label: category.name, count: 0, children: new Map() });
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
  return toNodes(rootCategoryMap, ([rootSlug, childOrSubSlug, subcategorySlug]) => {
    const specialHref = !childOrSubSlug ? getSpecialCategoryHref(rootSlug) : undefined;
    if (specialHref) return specialHref;
    if (subcategorySlug) return `/tienda?category=${childOrSubSlug}&subcategory=${subcategorySlug}`;
    if (childOrSubSlug) return categoriesBySlug.get(childOrSubSlug) ? `/tienda?category=${childOrSubSlug}` : `/tienda?category=${rootSlug}&subcategory=${childOrSubSlug}`;
    return `/tienda?category=${rootSlug}`;
  });
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

async function uniqueSlug(db: Db, table: "categories" | "subcategories" | "products", baseSlug: string, excludeId?: number) {
  const normalized = baseSlug || "item";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const rows = excludeId
      ? await db.unsafe(`SELECT id FROM ${table} WHERE slug = $1 AND id != $2`, [next, excludeId] as never[])
      : await db.unsafe(`SELECT id FROM ${table} WHERE slug = $1`, [next] as never[]);
    if (!rows.length) return next;
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueVariantSku(db: Db, baseSku: string, taken: Set<string>, excludeId?: number) {
  const normalized = baseSku.trim() || "sku";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const rows = excludeId
      ? await db`SELECT id FROM variants WHERE sku = ${next} AND id != ${excludeId}`
      : await db`SELECT id FROM variants WHERE sku = ${next}`;
    if (!taken.has(next) && !rows.length) {
      taken.add(next);
      return next;
    }
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueVariantBarcode(db: Db, baseBarcode: string, taken: Set<string>, excludeId?: number) {
  const normalized = baseBarcode.trim();
  if (!normalized) return "";
  let next = normalized;
  let suffix = 1;
  while (true) {
    const rows = excludeId
      ? await db`SELECT id FROM variants WHERE barcode = ${next} AND id != ${excludeId}`
      : await db`SELECT id FROM variants WHERE barcode = ${next}`;
    if (!taken.has(next) && !rows.length) {
      taken.add(next);
      return next;
    }
    next = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

async function normalizeCategoryPlacement(db: Db, input: { id?: number; showInMenu?: boolean; parentCategoryId?: number | null }) {
  if (input.showInMenu) return null;
  if (!input.parentCategoryId) return null;
  if (input.id && input.parentCategoryId === input.id) throw new Error("Una categorÃ­a no puede depender de sÃ­ misma.");
  const [parent] = await db`SELECT id, slug FROM categories WHERE id = ${input.parentCategoryId} AND show_in_menu = TRUE AND parent_category_id IS NULL` as unknown as { id: number; slug: string }[];
  if (!parent) throw new Error("ElegÃ­ una categorÃ­a principal vÃ¡lida.");
  if (isSpecialCategorySlug(parent.slug)) throw new Error("Las categorÃ­as fijas no aceptan categorÃ­as internas.");
  return input.parentCategoryId;
}

async function assertProductCategory(db: Db, categoryId: number | null) {
  if (!categoryId) return;
  const [category] = await db`SELECT slug FROM categories WHERE id = ${categoryId}` as unknown as { slug: string }[];
  if (!category) throw new Error("ElegÃ­ una categorÃ­a vÃ¡lida.");
  if (isSpecialCategorySlug(category.slug)) throw new Error("Las pÃ¡ginas fijas no pueden usarse como categorÃ­a de producto.");
}

async function resolveProductCategory(db: Db, input: { categoryId: number | null; subcategorySlug: string }) {
  if (!input.categoryId) return { categoryId: null, subcategorySlug: uncategorizedSubcategorySlug, subcategoryName: uncategorizedSubcategoryName };
  if (input.subcategorySlug === uncategorizedSubcategorySlug) {
    await assertProductCategory(db, input.categoryId);
    return { categoryId: input.categoryId, subcategorySlug: uncategorizedSubcategorySlug, subcategoryName: uncategorizedSubcategoryName };
  }
  const subcategory = await getSubcategoryBySlug(input.subcategorySlug, db);
  if (!subcategory) throw new Error("SubcategorÃ­a invÃ¡lida.");
  await assertProductCategory(db, subcategory.categoryId);
  return { categoryId: subcategory.categoryId, subcategorySlug: subcategory.slug, subcategoryName: subcategory.name };
}

export async function createCategory(input: { name: string; slug?: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const slug = await uniqueSlug(tx, "categories", slugify(input.slug || input.name));
    const parentCategoryId = await normalizeCategoryPlacement(tx, input);
    await tx`INSERT INTO categories (slug, name, description, parent_category_id, show_in_menu) VALUES (${slug}, ${input.name.trim()}, ${input.description ?? ""}, ${parentCategoryId}, ${Boolean(input.showInMenu)})`;
    await bumpSyncVersion(tx);
  });
}

export async function updateCategory(input: { id: number; name: string; slug: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [current] = await tx`SELECT slug FROM categories WHERE id = ${input.id}` as unknown as { slug: string }[];
    if (current && isSpecialCategorySlug(current.slug)) {
      await tx`UPDATE categories SET name = ${input.name.trim()}, description = ${input.description ?? ""}, parent_category_id = NULL, show_in_menu = ${Boolean(input.showInMenu)} WHERE id = ${input.id}`;
      await bumpSyncVersion(tx);
      return;
    }
    const slug = await uniqueSlug(tx, "categories", slugify(input.slug), input.id);
    const parentCategoryId = await normalizeCategoryPlacement(tx, input);
    if (!input.showInMenu) await tx`UPDATE categories SET parent_category_id = NULL WHERE parent_category_id = ${input.id}`;
    await tx`UPDATE categories SET name = ${input.name.trim()}, slug = ${slug}, description = ${input.description ?? ""}, parent_category_id = ${parentCategoryId}, show_in_menu = ${Boolean(input.showInMenu)} WHERE id = ${input.id}`;
    await bumpSyncVersion(tx);
  });
}

export async function deleteCategory(id: number) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [category] = await tx`SELECT id, slug FROM categories WHERE id = ${id}` as unknown as { id: number; slug: string }[];
    if (!category) return;
    if (isSpecialCategorySlug(category.slug)) throw new Error("Esta categorÃ­a fija no se puede eliminar.");
    await tx`UPDATE categories SET deleted_at = CURRENT_TIMESTAMP, show_in_menu = FALSE WHERE id = ${id}`;
    await bumpSyncVersion(tx);
  });
}

export async function deleteProduct(id: number) {
  await ensureSchema();
  await sql`UPDATE products SET archived_at = CURRENT_TIMESTAMP, featured = FALSE WHERE id = ${id}`;
  await bumpSyncVersion();
}

export async function createSubcategory(input: { categoryId: number; name: string; description?: string }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [category] = await tx`SELECT slug FROM categories WHERE id = ${input.categoryId}` as unknown as { slug: string }[];
    if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorÃ­as fijas no aceptan subcategorÃ­as.");
    const slug = await uniqueSlug(tx, "subcategories", slugify(input.name));
    await tx`INSERT INTO subcategories (category_id, slug, name, description) VALUES (${input.categoryId}, ${slug}, ${input.name.trim()}, ${input.description ?? ""})`;
    await bumpSyncVersion(tx);
  });
}

export async function updateSubcategory(input: { oldSlug: string; categoryId: number; name: string; description?: string }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [category] = await tx`SELECT slug FROM categories WHERE id = ${input.categoryId}` as unknown as { slug: string }[];
    if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorÃ­as fijas no aceptan subcategorÃ­as.");
    const nextSlug = await uniqueSlug(tx, "subcategories", slugify(input.name));
    await tx`UPDATE subcategories SET category_id = ${input.categoryId}, slug = ${nextSlug}, name = ${input.name.trim()}, description = ${input.description ?? ""} WHERE slug = ${input.oldSlug}`;
    await tx`UPDATE products SET category_id = ${input.categoryId}, subcategory_slug = ${nextSlug}, subcategory_name = ${input.name.trim()} WHERE subcategory_slug = ${input.oldSlug}`;
    await bumpSyncVersion(tx);
  });
}

export async function deleteSubcategory(slug: string) {
  await ensureSchema();
  await sql`UPDATE subcategories SET deleted_at = CURRENT_TIMESTAMP WHERE slug = ${slug}`;
  await bumpSyncVersion();
}

type ProductVariantInput = {
  id?: number;
  label: string;
  sku: string;
  barcode: string;
  priceCents: number;
  stockByBranch: { branchId: number; quantity: number }[];
};

export async function updateProduct(input: {
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
  await ensureSchema();
  await sql.begin(async (tx) => {
    const placement = await resolveProductCategory(tx, input);
    await tx`
      UPDATE products SET
        name = ${input.name.trim()}, brand = ${input.brand.trim()}, category_id = ${placement.categoryId}, species = ${input.species},
        subcategory_slug = ${placement.subcategorySlug}, subcategory_name = ${placement.subcategoryName}, life_stage = ${input.lifeStage ?? ""},
        size = ${input.size ?? ""}, need = ${input.need ?? ""}, description = ${input.description.trim()}, featured = ${input.featured},
        requires_advice = ${input.requiresAdvice}, color = ${input.color}, image_url = ${input.imageUrl ?? ""}
      WHERE id = ${input.id}
    `;
    const takenSkus = new Set<string>();
    const takenBarcodes = new Set<string>();
    for (const variant of input.variants) {
      const nextSku = await uniqueVariantSku(tx, variant.sku, takenSkus, variant.id);
      const nextBarcode = await uniqueVariantBarcode(tx, variant.barcode.trim() || nextSku, takenBarcodes, variant.id);
      let variantId = variant.id;
      if (variantId) {
        await tx`UPDATE variants SET label = ${variant.label.trim()}, sku = ${nextSku}, barcode = ${nextBarcode}, price_cents = ${variant.priceCents} WHERE id = ${variantId}`;
      } else {
        const [inserted] = await tx`INSERT INTO variants (product_id, label, sku, barcode, price_cents) VALUES (${input.id}, ${variant.label.trim()}, ${nextSku}, ${nextBarcode}, ${variant.priceCents}) RETURNING id`;
        variantId = Number(inserted.id);
      }
      for (const stock of variant.stockByBranch) {
        await tx`
          INSERT INTO inventory (variant_id, branch_id, quantity) VALUES (${variantId}, ${stock.branchId}, ${Math.max(0, stock.quantity)})
          ON CONFLICT (variant_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
        `;
      }
    }
    await bumpSyncVersion(tx);
  });
}

export async function createProduct(input: {
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
  await ensureSchema();
  await sql.begin(async (tx) => {
    const placement = await resolveProductCategory(tx, input);
    let slug = slugify(`${input.brand}-${input.name}`);
    if ((await tx`SELECT id FROM products WHERE slug = ${slug}`).length) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    const [inserted] = await tx`
      INSERT INTO products (
        slug, name, brand, category_id, species, subcategory_slug, subcategory_name, life_stage, size, need,
        description, featured, requires_advice, color, image_url
      ) VALUES (
        ${slug}, ${input.name.trim()}, ${input.brand.trim()}, ${placement.categoryId}, ${input.species}, ${placement.subcategorySlug},
        ${placement.subcategoryName}, ${input.lifeStage ?? ""}, ${input.size ?? ""}, ${input.need ?? ""}, ${input.description.trim()},
        ${input.featured}, ${input.requiresAdvice}, ${input.color}, ${input.imageUrl ?? ""}
      )
      RETURNING id
    `;
    const productId = Number(inserted.id);
    const takenSkus = new Set<string>();
    const takenBarcodes = new Set<string>();
    for (const variant of input.variants) {
      const nextSku = await uniqueVariantSku(tx, variant.sku, takenSkus);
      const nextBarcode = await uniqueVariantBarcode(tx, variant.barcode.trim() || nextSku, takenBarcodes);
      const [insertedVariant] = await tx`INSERT INTO variants (product_id, label, sku, barcode, price_cents) VALUES (${productId}, ${variant.label.trim()}, ${nextSku}, ${nextBarcode}, ${variant.priceCents}) RETURNING id`;
      const variantId = Number(insertedVariant.id);
      for (const stock of variant.stockByBranch) {
        await tx`INSERT INTO inventory (variant_id, branch_id, quantity) VALUES (${variantId}, ${stock.branchId}, ${Math.max(0, stock.quantity)})`;
      }
    }
    await bumpSyncVersion(tx);
  });
}

export async function updateInventory(variantId: number, branchId: number, quantity: number) {
  await ensureSchema();
  await sql`UPDATE inventory SET quantity = ${Math.max(0, quantity)}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${variantId} AND branch_id = ${branchId}`;
  await bumpSyncVersion();
}

export async function getInventoryQuantity(variantId: number, branchId: number, db: Db = sql) {
  await ensureSchema();
  const [row] = await db`SELECT quantity FROM inventory WHERE variant_id = ${variantId} AND branch_id = ${branchId}` as unknown as { quantity?: number }[];
  return Number(row?.quantity ?? 0);
}

export async function addInventory(variantId: number, branchId: number, delta: number) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const current = await getInventoryQuantity(variantId, branchId, tx);
    await tx`UPDATE inventory SET quantity = ${current + Math.max(0, delta)}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${variantId} AND branch_id = ${branchId}`;
    await bumpSyncVersion(tx);
  });
}

async function resolveDeliveryAllocationPlan(items: CartItemPayload[], db: Db) {
  const branches = (await db`SELECT id FROM branches WHERE verified = TRUE ORDER BY id` as unknown as { id: number }[]).map((branch) => branch.id);
  const variantAllocations = [];
  for (const item of items) {
    let remaining = item.quantity;
    const rankedBranches = await db`
      SELECT branch_id AS "branchId", quantity
      FROM inventory
      WHERE variant_id = ${item.variantId} AND branch_id IN ${db(branches)}
      ORDER BY quantity DESC, branch_id ASC
    ` as unknown as { branchId: number; quantity: number }[];
    const allocations: { branchId: number; quantity: number }[] = [];
    for (const branch of rankedBranches) {
      if (remaining <= 0) break;
      if (branch.quantity <= 0) continue;
      const quantity = Math.min(remaining, Number(branch.quantity));
      allocations.push({ branchId: branch.branchId, quantity });
      remaining -= quantity;
    }
    if (remaining > 0) throw new Error("No hay stock suficiente para armar el envÃ­o.");
    variantAllocations.push({ variantId: item.variantId, allocations });
  }
  const branchTotals = new Map<number, number>();
  for (const item of variantAllocations) for (const allocation of item.allocations) branchTotals.set(allocation.branchId, (branchTotals.get(allocation.branchId) ?? 0) + allocation.quantity);
  const rankedBranches = [...branchTotals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return { primaryBranchId: rankedBranches[0]?.[0] ?? branches[0] ?? 0, variantAllocations };
}

async function insertOrderAllocation(db: Db, orderId: number, variantId: number, branchId: number, quantity: number) {
  await db`
    INSERT INTO order_item_allocations (order_id, variant_id, branch_id, quantity)
    VALUES (${orderId}, ${variantId}, ${branchId}, ${quantity})
    ON CONFLICT (order_id, variant_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity
  `;
}

export async function createOrder(input: {
  name: string; phone: string; email: string; fulfillment: string; branchId: number; source?: string; address?: string; distanceKm?: number | null; items: CartItemPayload[];
}) {
  await ensureSchema();
  return sql.begin(async (tx) => {
    const deliveryPlan = input.fulfillment === "envio" ? await resolveDeliveryAllocationPlan(input.items, tx) : null;
    const resolvedBranchId = deliveryPlan?.primaryBranchId ?? input.branchId;
    if (!(await tx`SELECT id FROM branches WHERE id = ${resolvedBranchId}`).length) throw new Error("Sucursal invÃ¡lida.");
    const source = (input.source ?? "Tienda online").trim() || "Tienda online";
    const isCashSale = source.toLowerCase().startsWith("caja");
    const status = isCashSale ? "Cerrado" : input.fulfillment === "envio" ? "Pendiente de envÃ­o" : "Pendiente de retiro";
    let totalCents = 0;
    const lines: { variantId: number; quantity: number; unitPrice: number; allocations: { branchId: number; quantity: number }[] }[] = [];
    for (const item of input.items) {
      const [row] = await tx`SELECT price_cents AS "priceCents" FROM variants WHERE id = ${item.variantId}` as unknown as { priceCents?: number }[];
      if (!row || item.quantity < 1) throw new Error("El stock cambiÃ³. RevisÃ¡ la sucursal o la cantidad seleccionada.");
      const allocations = deliveryPlan?.variantAllocations.find((entry) => entry.variantId === item.variantId)?.allocations ?? [{ branchId: resolvedBranchId, quantity: item.quantity }];
      if (allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== item.quantity) throw new Error("El stock cambiÃ³. RevisÃ¡ la sucursal o la cantidad seleccionada.");
      totalCents += Number(row.priceCents) * item.quantity;
      lines.push({ variantId: item.variantId, quantity: item.quantity, unitPrice: Number(row.priceCents), allocations });
    }
    const code = `AGV-${Date.now().toString().slice(-8)}`;
    const [order] = await tx`
      INSERT INTO orders (code, customer_name, phone, email, fulfillment, delivery_address, delivery_distance_km, branch_id, total_cents, status, source, payment_method, paid_cents)
      VALUES (${code}, ${input.name}, ${input.phone}, ${input.email}, ${input.fulfillment}, ${input.address ?? ""}, ${input.distanceKm ?? null}, ${resolvedBranchId}, ${totalCents}, ${status}, ${source}, '', ${totalCents})
      RETURNING id
    `;
    for (const line of lines) {
      await tx`INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (${order.id}, ${line.variantId}, ${line.quantity}, ${line.unitPrice})`;
      for (const allocation of line.allocations) {
        const result = await tx`UPDATE inventory SET quantity = quantity - ${allocation.quantity}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${line.variantId} AND branch_id = ${allocation.branchId} AND quantity >= ${allocation.quantity}`;
        if (!result.count) throw new Error("No hay stock suficiente para reservar.");
        await insertOrderAllocation(tx, Number(order.id), line.variantId, allocation.branchId, allocation.quantity);
      }
    }
    await bumpSyncVersion(tx);
    return { code, totalCents };
  });
}

export async function createWholesaleOrder(input: {
  clientId: number;
  branchId: number;
  paymentMethod?: string;
  paidCents?: number;
  notes?: string;
  items: { variantId: number; quantity: number; branchId: number }[];
}) {
  await ensureSchema();
  return sql.begin(async (tx) => {
    const [client] = await tx`
      SELECT id, business_name AS "businessName", contact_name AS "contactName", phone, email, address
      FROM wholesale_clients
      WHERE id = ${input.clientId} AND deleted_at IS NULL
    ` as unknown as Pick<WholesaleClient, "id" | "businessName" | "contactName" | "phone" | "email" | "address">[];
    if (!client) throw new Error("Cliente invÃ¡lido.");
    if (!(await tx`SELECT id FROM branches WHERE id = ${input.branchId}`).length) throw new Error("Sucursal invÃ¡lida.");
    if (!input.items.length) throw new Error("AgregÃ¡ productos al pedido.");
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
      const [row] = await tx`
        SELECT v.price_cents AS "priceCents", i.quantity AS stock
        FROM variants v
        JOIN inventory i ON i.variant_id = v.id AND i.branch_id = ${item.branchId}
        WHERE v.id = ${item.variantId}
      ` as unknown as { priceCents: number; stock: number }[];
      if (!row) throw new Error("Producto o sucursal invÃ¡lidos.");
      if (Number(row.stock) < item.quantity) throw new Error("No hay stock suficiente para el pedido mayorista.");
      const line = linesByVariant.get(item.variantId) ?? { variantId: item.variantId, quantity: 0, unitPrice: Number(row.priceCents), allocations: [] };
      line.quantity += item.quantity;
      line.allocations.push({ branchId: item.branchId, quantity: item.quantity });
      linesByVariant.set(item.variantId, line);
      totalCents += Number(row.priceCents) * item.quantity;
    }
    const branchTotals = new Map<number, number>();
    for (const line of linesByVariant.values()) for (const allocation of line.allocations) branchTotals.set(allocation.branchId, (branchTotals.get(allocation.branchId) ?? 0) + allocation.quantity);
    const resolvedBranchId = [...branchTotals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? input.branchId;
    const code = `MAY-${Date.now().toString().slice(-8)}`;
    const paidCents = Math.min(totalCents, Math.max(0, Math.round(input.paidCents ?? totalCents)));
    const status = paidCents >= totalCents ? "Cerrado mayorista" : "Cuenta corriente";
    const [order] = await tx`
      INSERT INTO orders (code, customer_name, phone, email, fulfillment, delivery_address, delivery_distance_km, branch_id, total_cents, status, source, payment_method, paid_cents)
      VALUES (${code}, ${client.businessName}, ${client.phone || client.contactName || "Cliente mayorista"}, ${client.email || "mayorista@agrovet.local"}, 'Mayorista', ${input.notes?.trim() || client.address || ""}, NULL, ${resolvedBranchId}, ${totalCents}, ${status}, 'Mayorista', ${input.paymentMethod?.trim() ?? ""}, ${paidCents})
      RETURNING id
    `;
    for (const line of linesByVariant.values()) {
      await tx`INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (${order.id}, ${line.variantId}, ${line.quantity}, ${line.unitPrice})`;
      for (const allocation of line.allocations) {
        await tx`UPDATE inventory SET quantity = quantity - ${allocation.quantity}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${line.variantId} AND branch_id = ${allocation.branchId}`;
        await insertOrderAllocation(tx, Number(order.id), line.variantId, allocation.branchId, allocation.quantity);
      }
    }
    await bumpSyncVersion(tx);
    return { code, totalCents };
  });
}

export async function updateOrderPayment(input: { id: number; paidCents: number; paymentMethod?: string }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [order] = await tx`SELECT id, total_cents AS "totalCents", source, payment_method AS "paymentMethod" FROM orders WHERE id = ${input.id}` as unknown as { id: number; totalCents: number; source: string; paymentMethod: string }[];
    if (!order) throw new Error("Pedido invÃ¡lido.");
    if (!/^Mayorista\b/i.test(order.source)) throw new Error("Solo se cierran pagos mayoristas desde esta acciÃ³n.");
    const paidCents = Math.min(Number(order.totalCents), Math.max(0, Math.round(input.paidCents)));
    await tx`UPDATE orders SET paid_cents = ${paidCents}, payment_method = ${input.paymentMethod?.trim() || order.paymentMethod || "Cuenta corriente"}, status = ${paidCents >= Number(order.totalCents) ? "Cerrado mayorista" : "Cuenta corriente"} WHERE id = ${input.id}`;
    await bumpSyncVersion(tx);
  });
}

function isCanceledStatus(status: string) {
  return /cancelad/i.test(status);
}

async function readCurrentAllocations(orderId: number, fallbackBranchId: number, currentItems: Array<{ variantId: number; quantity: number }>, db: Db) {
  const grouped = await getAllocationBuckets(orderId, db);
  return currentItems.map((item) => ({
    variantId: item.variantId,
    allocations: grouped.get(item.variantId)?.length ? grouped.get(item.variantId)! : [{ branchId: fallbackBranchId, branchName: "Sucursal", quantity: item.quantity }],
  }));
}

export async function updateOrder(input: {
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
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [order] = await tx`SELECT id, branch_id AS "branchId", status, payment_method AS "paymentMethod", source FROM orders WHERE id = ${input.id}` as unknown as { id: number; branchId: number; status: string; paymentMethod: string; source: string }[];
    if (!order) throw new Error("Pedido invÃ¡lido.");
    const isCashSale = /^Caja\b/i.test(order.source);
    if (isCashSale && order.branchId !== input.branchId) throw new Error("No se puede cambiar la sucursal de una venta de caja desde este panel.");
    if (!(await tx`SELECT id FROM branches WHERE id = ${input.branchId}`).length) throw new Error("Sucursal invÃ¡lida.");
    const currentItems = await tx`
      SELECT variant_id AS "variantId", quantity, unit_price_cents AS "unitPriceCents"
      FROM order_items
      WHERE order_id = ${input.id}
      ORDER BY variant_id
    ` as unknown as Array<{ variantId: number; quantity: number; unitPriceCents: number }>;
    if (!currentItems.length) throw new Error("El pedido no tiene productos.");
    const currentMap = new Map(currentItems.map((item) => [item.variantId, item]));
    const nextItems = input.items.map((item) => ({ variantId: item.variantId, quantity: Math.max(0, Math.round(item.quantity)) }));
    if (nextItems.length !== currentItems.length) throw new Error("No se puede agregar ni quitar productos desde esta ediciÃ³n.");
    for (const item of nextItems) {
      if (!currentMap.has(item.variantId)) throw new Error("No se puede cambiar la lista de productos del pedido.");
      if (item.quantity < 1) throw new Error("La cantidad de unidades debe ser al menos 1.");
    }
    let resolvedBranchId = input.branchId;
    if (input.allocations?.length) {
      const totals = new Map<number, number>();
      for (const item of input.allocations) for (const allocation of item.allocations) totals.set(allocation.branchId, (totals.get(allocation.branchId) ?? 0) + allocation.quantity);
      resolvedBranchId = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? resolvedBranchId;
    }
    const currentCanceled = isCanceledStatus(order.status);
    const nextCanceled = isCanceledStatus(input.status);
    const currentAllocations = await readCurrentAllocations(input.id, order.branchId, currentItems, tx);
    const nextAllocationMap = new Map<number, { branchId: number; quantity: number }[]>();
    for (const entry of currentAllocations) nextAllocationMap.set(entry.variantId, entry.allocations);
    if (input.allocations?.length) {
      for (const item of input.allocations) {
        const totalAllocated = item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        const expected = nextItems.find((nextItem) => nextItem.variantId === item.variantId)?.quantity ?? 0;
        if (totalAllocated !== expected) throw new Error("La distribuciÃ³n del pedido no coincide con la cantidad total de unidades.");
        nextAllocationMap.set(item.variantId, item.allocations);
      }
    }
    const inventoryDeltas = new Map<string, { variantId: number; branchId: number; delta: number }>();
    const currentAllocationBuckets = await getAllocationBuckets(input.id, tx);
    for (const item of nextItems) {
      const nextAllocations = nextAllocationMap.get(item.variantId) ?? [{ branchId: input.branchId, quantity: item.quantity }];
      const currentAllocationsForItem = currentAllocationBuckets.get(item.variantId) ?? [{ branchId: input.branchId, branchName: "Sucursal", quantity: currentMap.get(item.variantId)?.quantity ?? item.quantity }];
      const currentByBranch = new Map(currentAllocationsForItem.map((allocation) => [allocation.branchId, allocation.quantity]));
      const nextByBranch = new Map(nextAllocations.map((allocation) => [allocation.branchId, allocation.quantity]));
      const branchIds = new Set<number>([...currentByBranch.keys(), ...nextByBranch.keys()]);
      for (const branchId of branchIds) {
        const currentAllocated = currentByBranch.get(branchId) ?? 0;
        const nextAllocated = nextByBranch.get(branchId) ?? 0;
        let delta = 0;
        if (!currentCanceled && !nextCanceled) delta = currentAllocated - nextAllocated;
        else if (currentCanceled && !nextCanceled) delta = -nextAllocated;
        else if (!currentCanceled && nextCanceled) delta = currentAllocated;
        if (!delta) continue;
        const key = `${item.variantId}:${branchId}`;
        inventoryDeltas.set(key, { variantId: item.variantId, branchId, delta: (inventoryDeltas.get(key)?.delta ?? 0) + delta });
      }
    }
    for (const delta of inventoryDeltas.values()) {
      if (delta.delta < 0) {
        const required = -delta.delta;
        const [row] = await tx`SELECT quantity FROM inventory WHERE variant_id = ${delta.variantId} AND branch_id = ${delta.branchId}` as unknown as { quantity?: number }[];
        if (Number(row?.quantity ?? 0) < required) throw new Error("No hay stock suficiente para ese cambio.");
      }
    }
    for (const delta of inventoryDeltas.values()) {
      if (delta.delta) await tx`UPDATE inventory SET quantity = quantity + ${delta.delta}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${delta.variantId} AND branch_id = ${delta.branchId}`;
    }
    const totalCents = nextItems.reduce((sum, item) => sum + (Number(currentMap.get(item.variantId)?.unitPriceCents ?? 0) * item.quantity), 0);
    await tx`
      UPDATE orders
      SET customer_name = ${input.customerName.trim()}, phone = ${input.phone.trim()}, email = ${input.email.trim()}, fulfillment = ${input.fulfillment.trim()}, branch_id = ${resolvedBranchId},
        delivery_address = ${input.deliveryAddress ?? ""}, delivery_distance_km = ${input.deliveryDistanceKm ?? null}, status = ${input.status.trim()}, source = ${input.source.trim()},
        total_cents = ${totalCents}, payment_method = ${input.paymentMethod?.trim() ?? order.paymentMethod ?? ""}
      WHERE id = ${input.id}
    `;
    await tx`DELETE FROM order_items WHERE order_id = ${input.id}`;
    await tx`DELETE FROM order_item_allocations WHERE order_id = ${input.id}`;
    for (const item of nextItems) {
      await tx`INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents) VALUES (${input.id}, ${item.variantId}, ${item.quantity}, ${Number(currentMap.get(item.variantId)?.unitPriceCents ?? 0)})`;
      const nextAllocations = nextAllocationMap.get(item.variantId) ?? [{ branchId: input.branchId, quantity: item.quantity }];
      for (const allocation of nextAllocations) await insertOrderAllocation(tx, input.id, item.variantId, allocation.branchId, allocation.quantity);
    }
    await bumpSyncVersion(tx);
  });
}

export async function deleteOrder(id: number) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [order] = await tx`SELECT id, branch_id AS "branchId", status, deleted_at AS "deletedAt" FROM orders WHERE id = ${id}` as unknown as { id: number; branchId: number; status: string; deletedAt: unknown }[];
    if (!order) return;
    if (order.deletedAt) return;
    const items = await tx`SELECT variant_id AS "variantId", quantity FROM order_items WHERE order_id = ${id}` as unknown as Array<{ variantId: number; quantity: number }>;
    const allocations = await getAllocationBuckets(id, tx);
    if (!isCanceledStatus(order.status)) {
      for (const item of items) {
        const buckets = allocations.get(item.variantId);
        if (!buckets?.length) {
          await tx`UPDATE inventory SET quantity = quantity + ${item.quantity}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${item.variantId} AND branch_id = ${order.branchId}`;
          continue;
        }
        for (const allocation of buckets) {
          await tx`UPDATE inventory SET quantity = quantity + ${allocation.quantity}, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ${item.variantId} AND branch_id = ${allocation.branchId}`;
        }
      }
    }
    await tx`UPDATE orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
    await bumpSyncVersion(tx);
  });
}

export async function getTrashItems(): Promise<TrashItem[]> {
  await ensureSchema();
  await purgeExpiredTrashItems();
  const [orders, products, categories, subcategories, clients] = await Promise.all([
    sql`
      SELECT id, code, customer_name AS "customerName", total_cents AS "amountCents", status, source, deleted_at AS "deletedAt"
      FROM orders
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    ` as unknown as Promise<Array<{ id: number; code: string; customerName: string; amountCents: number; status: string; source: string; deletedAt: unknown }>>,
    sql`
      SELECT p.id, p.brand, p.name, COALESCE(c.name, 'Sin categoria') AS category, p.archived_at AS "deletedAt",
        COALESCE((SELECT SUM(i.quantity) FROM inventory i JOIN variants v ON v.id = i.variant_id WHERE v.product_id = p.id), 0)::int AS stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.archived_at IS NOT NULL AND p.purged_at IS NULL
      ORDER BY p.archived_at DESC
    ` as unknown as Promise<Array<{ id: number; brand: string; name: string; category: string; stock: number; deletedAt: unknown }>>,
    sql`
      SELECT id, name, slug, deleted_at AS "deletedAt"
      FROM categories
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    ` as unknown as Promise<Array<{ id: number; name: string; slug: string; deletedAt: unknown }>>,
    sql`
      SELECT s.slug, s.name, COALESCE(c.name, 'Sin categoria') AS category, s.deleted_at AS "deletedAt"
      FROM subcategories s
      LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.deleted_at IS NOT NULL
      ORDER BY s.deleted_at DESC
    ` as unknown as Promise<Array<{ slug: string; name: string; category: string; deletedAt: unknown }>>,
    sql`
      SELECT id, business_name AS "businessName", contact_name AS "contactName", phone, email, deleted_at AS "deletedAt"
      FROM wholesale_clients
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    ` as unknown as Promise<Array<{ id: number; businessName: string; contactName: string; phone: string; email: string; deletedAt: unknown }>>,
  ]);

  return [
    ...orders.map((order): TrashItem => ({
      type: "order",
      id: Number(order.id),
      title: order.code,
      subtitle: order.customerName,
      amountCents: Number(order.amountCents),
      deletedAt: toIso(order.deletedAt),
      status: order.status,
      source: order.source,
    })),
    ...products.map((product): TrashItem => ({
      type: "product",
      id: Number(product.id),
      title: `${product.brand} ${product.name}`,
      subtitle: `${product.category} | ${Number(product.stock)} unidades en stock`,
      amountCents: 0,
      deletedAt: toIso(product.deletedAt),
      status: "Archivado",
      source: "Productos",
    })),
    ...categories.map((category): TrashItem => ({
      type: "category",
      id: Number(category.id),
      title: category.name,
      subtitle: category.slug,
      amountCents: 0,
      deletedAt: toIso(category.deletedAt),
      status: "Eliminada",
      source: "Categorias",
    })),
    ...subcategories.map((subcategory): TrashItem => ({
      type: "subcategory",
      id: subcategory.slug,
      title: subcategory.name,
      subtitle: subcategory.category,
      amountCents: 0,
      deletedAt: toIso(subcategory.deletedAt),
      status: "Eliminada",
      source: "Subcategorias",
    })),
    ...clients.map((client): TrashItem => ({
      type: "client",
      id: Number(client.id),
      title: client.businessName,
      subtitle: [client.contactName, client.phone, client.email].filter(Boolean).join(" | ") || "Sin datos de contacto",
      amountCents: 0,
      deletedAt: toIso(client.deletedAt),
      status: "Eliminado",
      source: "Clientes",
    })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

async function purgeTrashedProducts(db: Db, olderThanDays?: number) {
  const dateClause = olderThanDays ? sql`AND archived_at < NOW() - (${olderThanDays} || ' days')::interval` : sql``;
  const variants = await db`
    SELECT p.id AS "productId", v.id AS "variantId"
    FROM products p
    JOIN variants v ON v.product_id = p.id
    WHERE p.archived_at IS NOT NULL AND p.purged_at IS NULL ${dateClause}
  ` as unknown as Array<{ productId: number; variantId: number }>;
  const idsByProduct = new Map<number, number[]>();
  for (const row of variants) {
    const current = idsByProduct.get(row.productId) ?? [];
    current.push(row.variantId);
    idsByProduct.set(row.productId, current);
  }
  for (const [productId, variantIds] of idsByProduct) {
    const hasOrderItems = variantIds.length ? await db`SELECT 1 FROM order_items WHERE variant_id IN ${db(variantIds)} LIMIT 1` : [];
    if (hasOrderItems.length) {
      await db`UPDATE products SET purged_at = CURRENT_TIMESTAMP WHERE id = ${productId}`;
      continue;
    }
    if (variantIds.length) {
      await db`DELETE FROM order_item_allocations WHERE variant_id IN ${db(variantIds)}`;
      await db`DELETE FROM inventory WHERE variant_id IN ${db(variantIds)}`;
      await db`DELETE FROM variants WHERE id IN ${db(variantIds)}`;
    }
    await db`DELETE FROM products WHERE id = ${productId}`;
  }
  await db`UPDATE products SET purged_at = CURRENT_TIMESTAMP WHERE archived_at IS NOT NULL AND purged_at IS NULL AND id NOT IN (SELECT product_id FROM variants) ${dateClause}`;
}

async function purgeTrashItems(olderThanDays?: number) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const dateClause = olderThanDays ? sql`AND deleted_at < NOW() - (${olderThanDays} || ' days')::interval` : sql``;
    await tx`DELETE FROM order_item_allocations WHERE order_id IN (SELECT id FROM orders WHERE deleted_at IS NOT NULL ${dateClause})`;
    await tx`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE deleted_at IS NOT NULL ${dateClause})`;
    await tx`DELETE FROM orders WHERE deleted_at IS NOT NULL ${dateClause}`;
    await purgeTrashedProducts(tx, olderThanDays);
    await tx`DELETE FROM subcategories WHERE deleted_at IS NOT NULL ${dateClause}`;
    await tx`DELETE FROM categories WHERE deleted_at IS NOT NULL ${dateClause}`;
    await tx`DELETE FROM wholesale_clients WHERE deleted_at IS NOT NULL ${dateClause}`;
    await bumpSyncVersion(tx);
  });
}

export async function emptyTrash() {
  await purgeTrashItems();
}

export async function purgeExpiredTrashItems() {
  await purgeTrashItems(30);
}

export async function restoreTrashItem(input: { type: TrashItem["type"]; id: string | number }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    if (input.type === "product") {
      await tx`UPDATE products SET archived_at = NULL WHERE id = ${Number(input.id)}`;
    } else if (input.type === "category") {
      await tx`UPDATE categories SET deleted_at = NULL WHERE id = ${Number(input.id)}`;
    } else if (input.type === "subcategory") {
      await tx`UPDATE subcategories SET deleted_at = NULL WHERE slug = ${String(input.id)}`;
    } else if (input.type === "client") {
      await tx`UPDATE wholesale_clients SET deleted_at = NULL WHERE id = ${Number(input.id)}`;
    } else if (input.type === "order") {
      const id = Number(input.id);
      const [order] = await tx`SELECT id, branch_id AS "branchId", status, fulfillment, deleted_at AS "deletedAt" FROM orders WHERE id = ${id}` as unknown as { id: number; branchId: number; status: string; fulfillment: string; deletedAt: unknown }[];
      if (!order?.deletedAt) return;
      const items = await tx`SELECT variant_id AS "variantId", quantity FROM order_items WHERE order_id = ${id}` as unknown as Array<{ variantId: number; quantity: number }>;
      const allocations = await getAllocationBuckets(id, tx);
      for (const item of items) {
        const buckets = allocations.get(item.variantId) ?? [{ branchId: order.branchId, branchName: "", quantity: item.quantity }];
        for (const allocation of buckets) {
          const result = await tx`
            UPDATE inventory
            SET quantity = quantity - ${allocation.quantity}, updated_at = CURRENT_TIMESTAMP
            WHERE variant_id = ${item.variantId} AND branch_id = ${allocation.branchId} AND quantity >= ${allocation.quantity}
          `;
          if (!result.count) throw new Error("No hay stock suficiente para restaurar este pedido sin romper inventario.");
        }
      }
      await tx`UPDATE orders SET deleted_at = NULL WHERE id = ${id}`;
    }
    await bumpSyncVersion(tx);
  });
}

const loginWindowMs = 1000 * 60 * 15;
const loginLockMs = 1000 * 60 * 15;
const maxLoginFailures = 5;

export async function getLoginRateLimit(identifier: string) {
  await ensureSchema();
  const now = Date.now();
  const [row] = await sql`
    SELECT identifier, failures, locked_until AS "lockedUntil", reset_at AS "resetAt"
    FROM admin_login_attempts
    WHERE identifier = ${identifier}
  ` as unknown as Array<{ failures: number; lockedUntil: number; resetAt: number }>;
  if (!row) return { limited: false, retryAfterSeconds: 0 };
  if (Number(row.resetAt) <= now && Number(row.lockedUntil) <= now) {
    await sql`DELETE FROM admin_login_attempts WHERE identifier = ${identifier}`;
    return { limited: false, retryAfterSeconds: 0 };
  }
  if (Number(row.lockedUntil) > now) {
    return { limited: true, retryAfterSeconds: Math.ceil((Number(row.lockedUntil) - now) / 1000) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export async function recordLoginAttempt(identifier: string, success: boolean) {
  await ensureSchema();
  if (success) {
    await sql`DELETE FROM admin_login_attempts WHERE identifier = ${identifier}`;
    return;
  }
  const now = Date.now();
  const [current] = await sql`
    SELECT identifier, failures, locked_until AS "lockedUntil", reset_at AS "resetAt"
    FROM admin_login_attempts
    WHERE identifier = ${identifier}
  ` as unknown as Array<{ failures: number; lockedUntil: number; resetAt: number }>;
  const bucket = current && Number(current.resetAt) > now
    ? current
    : { failures: 0, lockedUntil: 0, resetAt: now + loginWindowMs };
  const failures = Number(bucket.failures) + 1;
  const lockedUntil = failures >= maxLoginFailures ? now + loginLockMs : Number(bucket.lockedUntil ?? 0);
  const resetAt = failures >= maxLoginFailures ? lockedUntil : Number(bucket.resetAt);
  await sql`
    INSERT INTO admin_login_attempts (identifier, failures, locked_until, reset_at, updated_at)
    VALUES (${identifier}, ${failures}, ${lockedUntil}, ${resetAt}, CURRENT_TIMESTAMP)
    ON CONFLICT (identifier) DO UPDATE SET
      failures = EXCLUDED.failures,
      locked_until = EXCLUDED.locked_until,
      reset_at = EXCLUDED.reset_at,
      updated_at = CURRENT_TIMESTAMP
  `;
}

