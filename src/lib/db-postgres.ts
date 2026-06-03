import "server-only";

import postgres from "postgres";
import { getSpecialCategoryHref, isSpecialCategorySlug, specialCategories } from "./special-categories";
import type { Branch, CartItemPayload, CatalogFilters, CatalogMenuNode, Category, OrderRecord, Product, SearchIndexItem, Variant, WholesaleClient } from "./types";

const uncategorizedSubcategorySlug = "sin-subcategoria";
const uncategorizedSubcategoryName = "Sin subcategoría";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the Postgres data layer.");
}

const sql = postgres(databaseUrl, {
  max: 10,
  ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
});

type Db = typeof sql | postgres.TransactionSql<Record<string, never>>;
let initialized: Promise<void> | null = null;

async function ensureSchema() {
  initialized ??= (async () => {
    await sql.unsafe(`
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
        show_in_menu BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
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
        archived_at TIMESTAMPTZ
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
        status TEXT NOT NULL DEFAULT 'Pendiente de confirmación',
        source TEXT NOT NULL DEFAULT 'Tienda online',
        payment_method TEXT NOT NULL DEFAULT '',
        paid_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
      CREATE INDEX IF NOT EXISTS products_subcategory_idx ON products(subcategory_slug);
      CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);
      CREATE INDEX IF NOT EXISTS inventory_branch_idx ON inventory(branch_id);
      CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
    `);
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

async function hydrateProduct(row: ProductRow, db: Db = sql): Promise<Product> {
  const stockRows = await db`
    SELECT v.id, v.label, v.sku, v.barcode, v.price_cents AS "priceCents", b.id AS "branchId", b.name AS "branchName",
      i.quantity
    FROM variants v
    JOIN inventory i ON i.variant_id = v.id
    JOIN branches b ON b.id = i.branch_id
    WHERE v.product_id = ${row.id}
    ORDER BY v.price_cents, b.id
  ` as unknown as VariantRow[];
  const variants = new Map<number, Variant>();
  for (const variant of stockRows) {
    const current = variants.get(variant.id) ?? {
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      priceCents: Number(variant.priceCents),
      stocks: [],
      totalStock: 0,
    };
    current.stocks.push({ branchId: variant.branchId, branchName: variant.branchName, quantity: Number(variant.quantity) });
    current.totalStock += Number(variant.quantity);
    variants.set(variant.id, current);
  }
  return { ...row, featured: Boolean(row.featured), requiresAdvice: Boolean(row.requiresAdvice), variants: [...variants.values()] };
}

const specialCategoryOrderSql = specialCategories
  .map((category, index) => `WHEN '${category.slug.replaceAll("'", "''")}' THEN ${index}`)
  .join(" ");

const baseSelect = `
  SELECT p.id, p.slug, p.name, p.brand, COALESCE(c.name, 'Sin categoría') AS category, COALESCE(c.slug, '') AS "categorySlug",
    COALESCE(NULLIF(p.subcategory_name, ''), '${uncategorizedSubcategoryName}') AS subcategory,
    COALESCE(NULLIF(p.subcategory_slug, ''), '${uncategorizedSubcategorySlug}') AS "subcategorySlug",
    p.species, p.life_stage AS "lifeStage", p.size, p.need, p.description, p.featured,
    p.requires_advice AS "requiresAdvice", p.color, p.image_url AS "imageUrl"
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_category_id
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
  const clauses: string[] = ["p.archived_at IS NULL"];
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
  return Promise.all(rows.map((row) => hydrateProduct(row)));
}

export async function getProduct(slug: string) {
  await ensureSchema();
  const rows = await sql.unsafe(`${baseSelect} WHERE p.slug = $1 AND p.archived_at IS NULL`, [slug] as never[]) as unknown as ProductRow[];
  return rows[0] ? hydrateProduct(rows[0]) : undefined;
}

export async function getFeaturedProducts() {
  return (await getProducts()).filter((product) => product.featured).slice(0, 4);
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
    LEFT JOIN products p ON p.subcategory_slug = s.slug AND p.archived_at IS NULL
    GROUP BY s.slug, s.name, s.description, c.id, c.slug, c.name
    ORDER BY COALESCE(c.name, 'Sin categoría'), s.name
  ` as unknown as { slug: string; name: string; description: string; categoryId: number | null; categorySlug: string | null; categoryName: string | null; count: number }[];
}

export async function getSubcategoryBySlug(slug: string, db: Db = sql) {
  await ensureSchema();
  const [row] = await db`
    SELECT s.slug AS slug, s.name AS name, s.description AS description,
      c.id AS "categoryId", c.slug AS "categorySlug", c.name AS "categoryName"
    FROM subcategories s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.slug = ${slug}
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
  await sql`DELETE FROM wholesale_clients WHERE id = ${id}`;
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
  const categoriesBySlug = new Map(allCategories.map((category) => [category.slug, category]));
  const categories = new Map<string, { name: string; count: number; subcategories: Map<string, { name: string; count: number }> }>();
  for (const category of allCategories) categories.set(category.slug, { name: category.name, count: 0, subcategories: new Map() });
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

async function normalizeCategoryPlacement(db: Db, input: { id?: number; showInMenu?: boolean; parentCategoryId?: number | null }) {
  if (input.showInMenu) return null;
  if (!input.parentCategoryId) return null;
  if (input.id && input.parentCategoryId === input.id) throw new Error("Una categoría no puede depender de sí misma.");
  const [parent] = await db`SELECT id, slug FROM categories WHERE id = ${input.parentCategoryId} AND show_in_menu = TRUE AND parent_category_id IS NULL` as unknown as { id: number; slug: string }[];
  if (!parent) throw new Error("Elegí una categoría principal válida.");
  if (isSpecialCategorySlug(parent.slug)) throw new Error("Las categorías fijas no aceptan categorías internas.");
  return input.parentCategoryId;
}

async function assertProductCategory(db: Db, categoryId: number | null) {
  if (!categoryId) return;
  const [category] = await db`SELECT slug FROM categories WHERE id = ${categoryId}` as unknown as { slug: string }[];
  if (!category) throw new Error("Elegí una categoría válida.");
  if (isSpecialCategorySlug(category.slug)) throw new Error("Las páginas fijas no pueden usarse como categoría de producto.");
}

async function resolveProductCategory(db: Db, input: { categoryId: number | null; subcategorySlug: string }) {
  if (!input.categoryId) return { categoryId: null, subcategorySlug: uncategorizedSubcategorySlug, subcategoryName: uncategorizedSubcategoryName };
  if (input.subcategorySlug === uncategorizedSubcategorySlug) {
    await assertProductCategory(db, input.categoryId);
    return { categoryId: input.categoryId, subcategorySlug: uncategorizedSubcategorySlug, subcategoryName: uncategorizedSubcategoryName };
  }
  const subcategory = await getSubcategoryBySlug(input.subcategorySlug, db);
  if (!subcategory) throw new Error("Subcategoría inválida.");
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
      await tx`UPDATE categories SET name = ${input.name.trim()}, parent_category_id = NULL, show_in_menu = ${Boolean(input.showInMenu)} WHERE id = ${input.id}`;
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
    if (isSpecialCategorySlug(category.slug)) throw new Error("Esta categoría fija no se puede eliminar.");
    const directSubcategories = await tx`SELECT slug FROM subcategories WHERE category_id = ${id}` as unknown as { slug: string }[];
    await tx`UPDATE categories SET parent_category_id = NULL WHERE parent_category_id = ${id}`;
    await tx`UPDATE subcategories SET category_id = NULL WHERE category_id = ${id}`;
    if (directSubcategories.length) {
      await tx`UPDATE products SET category_id = NULL, subcategory_slug = ${uncategorizedSubcategorySlug}, subcategory_name = ${uncategorizedSubcategoryName} WHERE subcategory_slug IN ${tx(directSubcategories.map((row) => row.slug))}`;
    }
    await tx`UPDATE products SET category_id = NULL, subcategory_slug = ${uncategorizedSubcategorySlug}, subcategory_name = ${uncategorizedSubcategoryName} WHERE category_id = ${id}`;
    await tx`DELETE FROM categories WHERE id = ${id}`;
    await bumpSyncVersion(tx);
  });
}

export async function deleteProduct(id: number) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const variants = await tx`SELECT id FROM variants WHERE product_id = ${id}` as unknown as { id: number }[];
    const variantIds = variants.map((variant) => variant.id);
    if (variantIds.length) {
      const hasOrderItems = await tx`SELECT 1 FROM order_items WHERE variant_id IN ${tx(variantIds)} LIMIT 1`;
      if (hasOrderItems.length) {
        await tx`UPDATE products SET archived_at = CURRENT_TIMESTAMP, featured = FALSE WHERE id = ${id}`;
        await bumpSyncVersion(tx);
        return;
      }
      await tx`DELETE FROM order_item_allocations WHERE variant_id IN ${tx(variantIds)}`;
      await tx`DELETE FROM inventory WHERE variant_id IN ${tx(variantIds)}`;
      await tx`DELETE FROM variants WHERE id IN ${tx(variantIds)}`;
    }
    await tx`DELETE FROM products WHERE id = ${id}`;
    await bumpSyncVersion(tx);
  });
}

export async function createSubcategory(input: { categoryId: number; name: string; description?: string }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [category] = await tx`SELECT slug FROM categories WHERE id = ${input.categoryId}` as unknown as { slug: string }[];
    if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorías fijas no aceptan subcategorías.");
    const slug = await uniqueSlug(tx, "subcategories", slugify(input.name));
    await tx`INSERT INTO subcategories (category_id, slug, name, description) VALUES (${input.categoryId}, ${slug}, ${input.name.trim()}, ${input.description ?? ""})`;
    await bumpSyncVersion(tx);
  });
}

export async function updateSubcategory(input: { oldSlug: string; categoryId: number; name: string; description?: string }) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    const [category] = await tx`SELECT slug FROM categories WHERE id = ${input.categoryId}` as unknown as { slug: string }[];
    if (category && isSpecialCategorySlug(category.slug)) throw new Error("Las categorías fijas no aceptan subcategorías.");
    const nextSlug = await uniqueSlug(tx, "subcategories", slugify(input.name));
    await tx`UPDATE subcategories SET category_id = ${input.categoryId}, slug = ${nextSlug}, name = ${input.name.trim()}, description = ${input.description ?? ""} WHERE slug = ${input.oldSlug}`;
    await tx`UPDATE products SET category_id = ${input.categoryId}, subcategory_slug = ${nextSlug}, subcategory_name = ${input.name.trim()} WHERE subcategory_slug = ${input.oldSlug}`;
    await bumpSyncVersion(tx);
  });
}

export async function deleteSubcategory(slug: string) {
  await ensureSchema();
  await sql.begin(async (tx) => {
    await tx`UPDATE products SET subcategory_slug = ${uncategorizedSubcategorySlug}, subcategory_name = ${uncategorizedSubcategoryName} WHERE subcategory_slug = ${slug}`;
    await tx`DELETE FROM subcategories WHERE slug = ${slug}`;
    await bumpSyncVersion(tx);
  });
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
    for (const variant of input.variants) {
      const nextSku = await uniqueVariantSku(tx, variant.sku, takenSkus, variant.id);
      const nextBarcode = variant.barcode.trim() || nextSku;
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
    for (const variant of input.variants) {
      const nextSku = await uniqueVariantSku(tx, variant.sku, takenSkus);
      const nextBarcode = variant.barcode.trim() || nextSku;
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
    if (remaining > 0) throw new Error("No hay stock suficiente para armar el envío.");
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
    if (!(await tx`SELECT id FROM branches WHERE id = ${resolvedBranchId}`).length) throw new Error("Sucursal inválida.");
    const source = (input.source ?? "Tienda online").trim() || "Tienda online";
    const isCashSale = source.toLowerCase().startsWith("caja");
    const status = isCashSale ? "Cerrado" : input.fulfillment === "envio" ? "Pendiente de envío" : "Pendiente de retiro";
    let totalCents = 0;
    const lines: { variantId: number; quantity: number; unitPrice: number; allocations: { branchId: number; quantity: number }[] }[] = [];
    for (const item of input.items) {
      const [row] = await tx`SELECT price_cents AS "priceCents" FROM variants WHERE id = ${item.variantId}` as unknown as { priceCents?: number }[];
      if (!row || item.quantity < 1) throw new Error("El stock cambió. Revisá la sucursal o la cantidad seleccionada.");
      const allocations = deliveryPlan?.variantAllocations.find((entry) => entry.variantId === item.variantId)?.allocations ?? [{ branchId: resolvedBranchId, quantity: item.quantity }];
      if (allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== item.quantity) throw new Error("El stock cambió. Revisá la sucursal o la cantidad seleccionada.");
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
      WHERE id = ${input.clientId}
    ` as unknown as Pick<WholesaleClient, "id" | "businessName" | "contactName" | "phone" | "email" | "address">[];
    if (!client) throw new Error("Cliente inválido.");
    if (!(await tx`SELECT id FROM branches WHERE id = ${input.branchId}`).length) throw new Error("Sucursal inválida.");
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
      const [row] = await tx`
        SELECT v.price_cents AS "priceCents", i.quantity AS stock
        FROM variants v
        JOIN inventory i ON i.variant_id = v.id AND i.branch_id = ${item.branchId}
        WHERE v.id = ${item.variantId}
      ` as unknown as { priceCents: number; stock: number }[];
      if (!row) throw new Error("Producto o sucursal inválidos.");
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
    if (!order) throw new Error("Pedido inválido.");
    if (!/^Mayorista\b/i.test(order.source)) throw new Error("Solo se cierran pagos mayoristas desde esta acción.");
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
    if (!order) throw new Error("Pedido inválido.");
    const isCashSale = /^Caja\b/i.test(order.source);
    if (isCashSale && order.branchId !== input.branchId) throw new Error("No se puede cambiar la sucursal de una venta de caja desde este panel.");
    if (!(await tx`SELECT id FROM branches WHERE id = ${input.branchId}`).length) throw new Error("Sucursal inválida.");
    const currentItems = await tx`
      SELECT variant_id AS "variantId", quantity, unit_price_cents AS "unitPriceCents"
      FROM order_items
      WHERE order_id = ${input.id}
      ORDER BY variant_id
    ` as unknown as Array<{ variantId: number; quantity: number; unitPriceCents: number }>;
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
        if (totalAllocated !== expected) throw new Error("La distribución del pedido no coincide con la cantidad total de unidades.");
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
    const [order] = await tx`SELECT id, branch_id AS "branchId", status FROM orders WHERE id = ${id}` as unknown as { id: number; branchId: number; status: string }[];
    if (!order) return;
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
    await tx`DELETE FROM orders WHERE id = ${id}`;
    await bumpSyncVersion(tx);
  });
}
