import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const root = process.cwd();
const sqlitePath = process.argv.find((arg) => arg.startsWith("--sqlite="))?.slice("--sqlite=".length) ?? join(root, "data", "agrovet.sqlite");
const reset = process.argv.includes("--reset");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(join(root, ".env.local"));

const connectionUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error("DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING o DATABASE_URL no está configurado. Agregalo al entorno o a .env.local antes de migrar.");
}

if (!existsSync(sqlitePath)) {
  throw new Error(`No encontré la base SQLite en ${sqlitePath}`);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const sql = postgres(connectionUrl, {
  ssl: {
    rejectUnauthorized: false,
  },
});

const schema = `
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
    purged_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    refund_method TEXT NOT NULL DEFAULT '',
    refund_note TEXT NOT NULL DEFAULT ''
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
`;

const tables = [
  { name: "branches", conflict: ["id"], columns: ["id", "slug", "name", "address", "phone", "map_url", "verified"], bools: ["verified"] },
  { name: "categories", conflict: ["id"], columns: ["id", "slug", "name", "description", "parent_category_id", "show_in_menu", "deleted_at"], bools: ["show_in_menu"], nullIfEmpty: ["deleted_at"], sequence: "categories_id_seq" },
  { name: "subcategories", conflict: ["id"], columns: ["id", "category_id", "slug", "name", "description", "deleted_at"], nullIfEmpty: ["deleted_at"], sequence: "subcategories_id_seq" },
  { name: "products", conflict: ["id"], columns: ["id", "slug", "name", "brand", "category_id", "species", "subcategory_slug", "subcategory_name", "life_stage", "size", "need", "description", "featured", "requires_advice", "color", "image_url", "archived_at", "purged_at", "active"], bools: ["featured", "requires_advice", "active"], nullIfEmpty: ["archived_at", "purged_at"], sequence: "products_id_seq" },
  { name: "variants", conflict: ["id"], columns: ["id", "product_id", "label", "sku", "barcode", "price_cents"], sequence: "variants_id_seq" },
  { name: "inventory", conflict: ["variant_id", "branch_id"], columns: ["variant_id", "branch_id", "quantity", "updated_at"] },
  { name: "wholesale_clients", conflict: ["id"], columns: ["id", "business_name", "contact_name", "phone", "email", "address", "tax_id", "notes", "created_at", "deleted_at"], nullIfEmpty: ["deleted_at"], sequence: "wholesale_clients_id_seq" },
  { name: "orders", conflict: ["id"], columns: ["id", "code", "customer_name", "phone", "email", "fulfillment", "delivery_address", "delivery_distance_km", "branch_id", "total_cents", "status", "source", "payment_method", "paid_cents", "created_at", "deleted_at", "refund_method", "refund_note"], nullIfEmpty: ["deleted_at"], sequence: "orders_id_seq" },
  { name: "order_items", conflict: ["order_id", "variant_id"], columns: ["order_id", "variant_id", "quantity", "unit_price_cents"] },
  { name: "order_item_allocations", conflict: ["order_id", "variant_id", "branch_id"], columns: ["order_id", "variant_id", "branch_id", "quantity"] },
  { name: "app_meta", conflict: ["key"], columns: ["key", "value"] },
];

function normalizeRow(row, table) {
  const next = {};
  for (const column of table.columns) {
    let value = row[column];
    if (table.bools?.includes(column)) value = Boolean(value);
    if (table.nullIfEmpty?.includes(column) && value === "") value = null;
    next[column] = value;
  }
  return next;
}

async function upsertRows(tx, table) {
  const rows = sqlite.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all().map((row) => normalizeRow(row, table));
  if (!rows.length) return 0;
  const updates = table.columns
    .filter((column) => !table.conflict.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  const conflict = table.conflict.join(", ");
  const query = `
    INSERT INTO ${table.name} (${table.columns.join(", ")})
    VALUES (${table.columns.map((_, index) => `$${index + 1}`).join(", ")})
    ON CONFLICT (${conflict}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}
  `;
  for (const row of rows) {
    await tx.unsafe(query, table.columns.map((column) => row[column]));
  }
  return rows.length;
}

async function syncSequence(tx, table) {
  if (!table.sequence) return;
  await tx.unsafe(`SELECT setval('${table.sequence}', COALESCE((SELECT MAX(id) FROM ${table.name}), 1), true)`);
}

// admin_login_attempts no se copia a propósito: es un registro temporal de intentos de login.

// Pide confirmación por consola. Si no hay nadie para responder (entrada cerrada), cuenta como "no".
async function askConfirmation(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise((resolve) => prompt.once("close", () => resolve("")));
  const answer = await Promise.race([prompt.question(question), closed]);
  prompt.close();
  return String(answer ?? "").trim();
}

async function tableCount(name) {
  const [exists] = await sql`SELECT to_regclass(${name}) AS table`;
  if (!exists?.table) return 0;
  const [row] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${name}`);
  return Number(row.count);
}

const [{ database }] = await sql`SELECT current_database() AS database`;
const target = `${database} en ${new URL(connectionUrl).hostname}`;
const existingOrders = await tableCount("orders");
const existingProducts = await tableCount("products");
if (existingOrders || existingProducts) {
  if (!reset) {
    await sql.end();
    throw new Error(`La base de destino (${target}) ya tiene ${existingProducts} productos y ${existingOrders} pedidos. No se migra encima de datos existentes: si de verdad querés reemplazarlos, corré con --reset.`);
  }
  const answer = await askConfirmation(`ATENCIÓN: --reset BORRA ${existingProducts} productos y ${existingOrders} pedidos de ${target}.\nEscribí el nombre de la base (${database}) para confirmar: `);
  if (answer !== database) {
    await sql.end();
    throw new Error("El nombre no coincide. No se tocó nada.");
  }
}

// Si el destino lo creó la app, sus tablas ya existen: se verifica que tengan todas las columnas que se copian.
async function assertTargetColumns(tx) {
  for (const table of tables) {
    const rows = await tx`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table.name}`;
    const present = new Set(rows.map((row) => row.column_name));
    const missing = table.columns.filter((column) => !present.has(column));
    if (missing.length) throw new Error(`La tabla ${table.name} del destino no tiene las columnas ${missing.join(", ")}. Abrí la app una vez contra esa base para que complete el esquema y volvé a correr.`);
  }
}

await sql.begin(async (tx) => {
  await tx.unsafe(schema);
  await assertTargetColumns(tx);
  if (reset) {
    await tx.unsafe(`
      TRUNCATE order_item_allocations, order_items, orders, wholesale_clients, inventory, variants, products, subcategories, categories, branches, app_meta
      RESTART IDENTITY CASCADE
    `);
    await tx`INSERT INTO app_meta (key, value) VALUES ('sync_version', 0)`;
  }
  for (const table of tables) {
    const count = await upsertRows(tx, table);
    await syncSequence(tx, table);
    console.log(`${table.name}: ${count}`);
  }
});

await sql.end();
sqlite.close();

console.log("Migración terminada.");
