import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
