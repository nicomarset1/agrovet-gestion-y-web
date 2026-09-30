import "server-only";

import { revalidateTag, unstable_cache, unstable_noStore as noStore } from "next/cache";
import type { CatalogFilters, CartItemPayload, WholesaleClient } from "./types";

const hasPostgres = Boolean(process.env.DATABASE_URL);
const isHostedProduction = process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production";

type SqliteDriver = typeof import("./db-sqlite");
type PostgresDriver = typeof import("./db-postgres");
type Driver = SqliteDriver | PostgresDriver;

let driverPromise: Promise<Driver> | null = null;

async function getDriver(): Promise<Driver> {
  if (!hasPostgres && isHostedProduction) {
    throw new Error("DATABASE_URL es obligatorio en produccion. Sin una base Postgres compartida, los pedidos y ventas no se van a reflejar entre sesiones ni se van a conservar.");
  }
  driverPromise ??= hasPostgres ? import("./db-postgres") : import("./db-sqlite");
  return driverPromise;
}

// La versión de sincronización se lee de la caché de Next (en Vercel, compartida entre instancias) y
// no de la base: el panel la consulta cada 2 s y, si fuera a Postgres, Neon nunca se suspendería y se
// consumiría la cuota de cómputo. Cada escritura de abajo invalida la caché (markSynced) y la próxima
// consulta lee el valor nuevo. El vencimiento de 10 min es solo red de seguridad para lo que se escribe
// durante una lectura (reservas vencidas, papelera de más de 30 días), donde no se puede invalidar.
const syncVersionTag = "sync-version";
const readCachedSyncVersion = unstable_cache(
  async () => (await getDriver()).getSyncVersion(),
  ["sync-version"],
  { tags: [syncVersionTag], revalidate: 600 },
);

export async function getSyncVersion() {
  noStore();
  return readCachedSyncVersion();
}

// Invalida la versión cacheada. Solo funciona en Server Actions y Route Handlers (que es desde donde se
// escribe); en cualquier otro contexto no hace nada y la red de seguridad de 10 min lo cubre.
function markSynced() {
  try {
    revalidateTag(syncVersionTag, { expire: 0 });
  } catch {
    // Fuera de una acción o route handler (por ejemplo, scripts): se ignora.
  }
}

async function withSync<T>(write: T | Promise<T>): Promise<Awaited<T>> {
  try {
    return await write;
  } finally {
    // Aunque la escritura falle se invalida: una transacción parcial o un error después del commit no
    // deben dejar el panel sin enterarse.
    markSynced();
  }
}

export async function getProducts(filters: CatalogFilters = {}) {
  return (await getDriver()).getProducts(filters);
}

export async function getProduct(slug: string) {
  return (await getDriver()).getProduct(slug);
}

export async function getProductImage(id: number) {
  return (await getDriver()).getProductImage(id);
}

export async function getFeaturedProducts() {
  return (await getDriver()).getFeaturedProducts();
}

export async function getCategories() {
  return (await getDriver()).getCategories();
}

export async function getSubcategories() {
  return (await getDriver()).getSubcategories();
}

export async function getSubcategoryBySlug(slug: string) {
  return (await getDriver()).getSubcategoryBySlug(slug);
}

export async function getBranches() {
  return (await getDriver()).getBranches();
}

export async function getWholesaleClients() {
  return (await getDriver()).getWholesaleClients();
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
  return withSync((await getDriver()).createWholesaleClient(input));
}

export async function updateWholesaleClient(input: WholesaleClient) {
  return withSync((await getDriver()).updateWholesaleClient(input));
}

export async function deleteWholesaleClient(id: number) {
  return withSync((await getDriver()).deleteWholesaleClient(id));
}

export async function getAdminSnapshot() {
  noStore();
  return (await getDriver()).getAdminSnapshot();
}

export async function getTrashItems() {
  noStore();
  return (await getDriver()).getTrashItems();
}

export async function restoreTrashItem(input: Parameters<SqliteDriver["restoreTrashItem"]>[0]) {
  return withSync((await getDriver()).restoreTrashItem(input));
}

export async function emptyTrash() {
  return withSync((await getDriver()).emptyTrash());
}

export async function getCatalogFacets() {
  return (await getDriver()).getCatalogFacets();
}

export async function getSearchIndex() {
  return (await getDriver()).getSearchIndex();
}

export async function getCatalogMenu() {
  return (await getDriver()).getCatalogMenu();
}

export async function createCategory(input: { name: string; slug?: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  return withSync((await getDriver()).createCategory(input));
}

export async function updateCategory(input: { id: number; name: string; slug: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  return withSync((await getDriver()).updateCategory(input));
}

export async function deleteCategory(id: number) {
  return withSync((await getDriver()).deleteCategory(id));
}

export async function deleteProduct(id: number) {
  return withSync((await getDriver()).deleteProduct(id));
}

export async function createSubcategory(input: { categoryId: number; name: string; description?: string }) {
  return withSync((await getDriver()).createSubcategory(input));
}

export async function updateSubcategory(input: { oldSlug: string; categoryId: number; name: string; description?: string }) {
  return withSync((await getDriver()).updateSubcategory(input));
}

export async function deleteSubcategory(slug: string) {
  return withSync((await getDriver()).deleteSubcategory(slug));
}

export async function updateProduct(input: Parameters<SqliteDriver["updateProduct"]>[0]) {
  return withSync((await getDriver()).updateProduct(input));
}

export async function createProduct(input: Parameters<SqliteDriver["createProduct"]>[0]) {
  return withSync((await getDriver()).createProduct(input));
}

export async function setProductActive(id: number, active: boolean) {
  return withSync((await getDriver()).setProductActive(id, active));
}

export async function updateInventory(variantId: number, branchId: number, quantity: number) {
  return withSync((await getDriver()).updateInventory(variantId, branchId, quantity));
}

export async function getInventoryQuantity(variantId: number, branchId: number) {
  return (await getDriver()).getInventoryQuantity(variantId, branchId);
}

export async function addInventory(variantId: number, branchId: number, delta: number) {
  return withSync((await getDriver()).addInventory(variantId, branchId, delta));
}

export async function createOrder(input: {
  name: string;
  phone: string;
  email: string;
  fulfillment: string;
  branchId: number;
  source: string;
  paymentMethod?: "mercado_pago" | "efectivo";
  address?: string;
  distanceKm?: number | null;
  items: CartItemPayload[];
  // Solo para ventas de Caja desde el panel (server action con sesión de admin).
  cashSale?: { source: string };
}) {
  return withSync((await getDriver()).createOrder(input));
}

export async function createWholesaleOrder(input: Parameters<SqliteDriver["createWholesaleOrder"]>[0]) {
  return withSync((await getDriver()).createWholesaleOrder(input));
}

export async function updateOrderPayment(input: { id: number; paidCents: number; paymentMethod?: string }) {
  return withSync((await getDriver()).updateOrderPayment(input));
}

export async function markOrderPaidByCode(code: string, paymentMethod: string, amountCents: number) {
  return withSync((await getDriver()).markOrderPaidByCode(code, paymentMethod, amountCents));
}

export async function markOrderPaymentFailedByCode(code: string) {
  return withSync((await getDriver()).markOrderPaymentFailedByCode(code));
}

export async function releaseExpiredReservations(options: { force?: boolean } = {}) {
  return withSync((await getDriver()).releaseExpiredReservations(options));
}

export async function getOrderReservation(code: string) {
  return (await getDriver()).getOrderReservation(code);
}

export async function discardUnpaidOrder(code: string) {
  return withSync((await getDriver()).discardUnpaidOrder(code));
}

export async function updateOrder(input: Parameters<SqliteDriver["updateOrder"]>[0]) {
  return withSync((await getDriver()).updateOrder(input));
}

export async function deleteOrder(input: number | { id: number; refundMethod?: string; refundNote?: string }) {
  return withSync((await getDriver()).deleteOrder(input));
}

export async function getLowStockThreshold() {
  return (await getDriver()).getLowStockThreshold();
}

export async function setLowStockThreshold(value: number) {
  return (await getDriver()).setLowStockThreshold(value);
}

export async function getLowStockItems(threshold: number) {
  return (await getDriver()).getLowStockItems(threshold);
}

export async function getLoginRateLimit(identifier: string) {
  return (await getDriver()).getLoginRateLimit(identifier);
}

export async function recordLoginAttempt(identifier: string, success: boolean) {
  return (await getDriver()).recordLoginAttempt(identifier, success);
}
