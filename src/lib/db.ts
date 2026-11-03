import "server-only";

import { revalidateTag, unstable_cache, unstable_noStore as noStore } from "next/cache";
import type { CatalogFilters, CartItemPayload, OrderExtraRecord, WholesaleClient } from "./types";

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

// Lecturas públicas de catálogo: cada visita a la tienda las pide varias veces y, sin caché, Neon no se suspendería
// nunca. Mismo tag que la versión de sincronización, así cada escritura (withSync) las invalida; el vencimiento corto
// cubre lo que se escribe durante una lectura. Si la caché no existe (scripts fuera de Next), se lee directo.
// El panel no usa esto: getAdminSnapshot, getTrashItems y los *Fresh van siempre a la base.
//
// Las reservas vencidas se siguen liberando: cada recarga de la entrada corre driver.getProducts, que barre antes de
// leer, y también barren createOrder, el webhook de Mercado Pago y el panel. Lo liberado aparece en la tienda enseguida
// si lo barrió una escritura, y a más tardar en la siguiente recarga si lo barrió una lectura.
//
// Tamaño: Next no guarda entradas de más de 2 MB (no falla, solo no cachea). Hoy el catálogo entero ocupa ~420 KB.
// Nada de esto trae fotos: las consultas de productos devuelven la ruta, nunca el data URL.
const catalogRevalidateSeconds = 120;

function catalogCache<A extends unknown[], R>(name: string, read: (...args: A) => Promise<R>) {
  const cached = unstable_cache(read, ["catalogo", name], { tags: [syncVersionTag], revalidate: catalogRevalidateSeconds });
  return async (...args: A): Promise<R> => {
    try {
      return await cached(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes("incrementalCache missing")) return read(...args);
      throw error;
    }
  };
}

const readCachedProducts = catalogCache("productos", async (filters: CatalogFilters) => (await getDriver()).getProducts(filters));
const readCachedFeaturedProducts = catalogCache("destacados", async () => (await getDriver()).getFeaturedProducts());
const readCachedCategories = catalogCache("categorias", async () => (await getDriver()).getCategories());
const readCachedSubcategories = catalogCache("subcategorias", async () => (await getDriver()).getSubcategories());
const readCachedBranches = catalogCache("sucursales", async () => (await getDriver()).getBranches());
const readCachedCatalogFacets = catalogCache("facetas", async () => (await getDriver()).getCatalogFacets());
const readCachedSearchIndex = catalogCache("buscador", async () => (await getDriver()).getSearchIndex());
const readCachedCatalogMenu = catalogCache("menu", async () => (await getDriver()).getCatalogMenu());
const readCachedProductImageIndex = catalogCache("fotos", async () => (await getDriver()).getProductImageIndex());

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
  return readCachedProducts(filters);
}

// Sale del catálogo cacheado (mismo filtro que getProducts sin filtros): así un slug inventado no consulta la
// base ni crea una entrada nueva en la caché por cada URL.
export async function getProduct(slug: string) {
  return (await readCachedProducts({})).find((product) => product.slug === slug);
}

export async function getProductImage(id: number) {
  return (await getDriver()).getProductImage(id);
}

export async function getProductImageIndex() {
  return readCachedProductImageIndex();
}

export async function getFeaturedProducts() {
  return readCachedFeaturedProducts();
}

export async function getCategories() {
  return readCachedCategories();
}

export async function getSubcategories() {
  return readCachedSubcategories();
}

// Para el panel, que debe leer siempre fresco.
export async function getCategoriesFresh() {
  noStore();
  return (await getDriver()).getCategories();
}

export async function getSubcategoriesFresh() {
  noStore();
  return (await getDriver()).getSubcategories();
}

export async function getSubcategoryBySlug(slug: string) {
  return (await getDriver()).getSubcategoryBySlug(slug);
}

export async function getBranches() {
  return readCachedBranches();
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
  return readCachedCatalogFacets();
}

export async function getSearchIndex() {
  return readCachedSearchIndex();
}

export async function getCatalogMenu() {
  return readCachedCatalogMenu();
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
  cashSale?: { source: string; cashDiscount?: boolean; manualPrices?: Record<number, number>; expectedPrices?: Record<number, number>; extras?: OrderExtraRecord[] };
  // Total que vio el cliente: si no coincide con el que calcula el servidor, no se crea el pedido.
  expectedTotalCents?: number;
}) {
  return withSync((await getDriver()).createOrder(input));
}

export async function createWholesaleOrder(input: Parameters<SqliteDriver["createWholesaleOrder"]>[0]) {
  return withSync((await getDriver()).createWholesaleOrder(input));
}

export async function updateOrderPayment(input: { id: number; addCents?: number; settle?: boolean; paymentMethod?: string }) {
  return withSync((await getDriver()).updateOrderPayment(input));
}

export async function markOrderPaidByCode(code: string, paymentMethod: string, amountCents: number, paymentRef = "") {
  return withSync((await getDriver()).markOrderPaidByCode(code, paymentMethod, amountCents, paymentRef));
}

export async function markOrderRefundedByCode(code: string, paymentRef = "") {
  return withSync((await getDriver()).markOrderRefundedByCode(code, paymentRef));
}

// Sin withSync: es un contador interno, el panel no tiene nada que refrescar.
export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  return (await getDriver()).hitRateLimit(key, limit, windowMs);
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

export async function reserveLoginAttempt(identifier: string) {
  return (await getDriver()).reserveLoginAttempt(identifier);
}

export async function clearLoginFailures(identifier: string) {
  return (await getDriver()).clearLoginFailures(identifier);
}
