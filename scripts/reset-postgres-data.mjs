import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const root = process.cwd();

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
  throw new Error("DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING o DATABASE_URL no está configurado.");
}

const sql = postgres(connectionUrl, {
  ssl: {
    rejectUnauthorized: false,
  },
});

// Pide confirmación por consola. Si no hay nadie para responder (entrada cerrada), cuenta como "no".
async function askConfirmation(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise((resolve) => prompt.once("close", () => resolve("")));
  const answer = await Promise.race([prompt.question(question), closed]);
  prompt.close();
  return String(answer ?? "").trim();
}

// Este script BORRA todos los pedidos y clientes mayoristas y deja el stock en 0: antes de tocar nada
// muestra qué va a borrar y pide escribir el nombre de la base para confirmar.
async function count(query) {
  try {
    const [row] = await sql.unsafe(query);
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

const [{ database }] = await sql`SELECT current_database() AS database`;
const target = `${database} en ${new URL(connectionUrl).hostname}`;
const orders = await count("SELECT COUNT(*)::int AS count FROM orders");
const clients = await count("SELECT COUNT(*)::int AS count FROM wholesale_clients");
const units = await count("SELECT COALESCE(SUM(quantity), 0)::int AS count FROM inventory");

const answer = await askConfirmation(
  `ATENCIÓN: esto BORRA ${orders} pedidos y ${clients} clientes mayoristas y pone en 0 el stock (${units} unidades) de ${target}.\n` +
  `Escribí el nombre de la base (${database}) para confirmar: `,
);
if (answer !== database) {
  await sql.end();
  throw new Error("El nombre no coincide. No se tocó nada.");
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    TRUNCATE order_item_allocations, order_items, orders, wholesale_clients, admin_login_attempts, app_meta
    RESTART IDENTITY CASCADE
  `);
  await tx`UPDATE inventory SET quantity = 0, updated_at = CURRENT_TIMESTAMP`;
  await tx`INSERT INTO app_meta (key, value) VALUES ('sync_version', 0)`;
});

await sql.end();

console.log("Datos operativos reseteados.");
