import "server-only";

import { unstable_noStore as noStore } from "next/cache";
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

export async function getSyncVersion() {
  noStore();
  return (await getDriver()).getSyncVersion();
}

export async function getProducts(filters: CatalogFilters = {}) {
  return (await getDriver()).getProducts(filters);
}

export async function getProduct(slug: string) {
  return (await getDriver()).getProduct(slug);
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
  return (await getDriver()).createWholesaleClient(input);
}

export async function updateWholesaleClient(input: WholesaleClient) {
  return (await getDriver()).updateWholesaleClient(input);
}

export async function deleteWholesaleClient(id: number) {
  return (await getDriver()).deleteWholesaleClient(id);
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
  return (await getDriver()).restoreTrashItem(input);
}

export async function emptyTrash() {
  return (await getDriver()).emptyTrash();
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
  return (await getDriver()).createCategory(input);
}

export async function updateCategory(input: { id: number; name: string; slug: string; description?: string; showInMenu?: boolean; parentCategoryId?: number | null }) {
  return (await getDriver()).updateCategory(input);
}

export async function deleteCategory(id: number) {
  return (await getDriver()).deleteCategory(id);
}

export async function deleteProduct(id: number) {
  return (await getDriver()).deleteProduct(id);
}

export async function createSubcategory(input: { categoryId: number; name: string; description?: string }) {
  return (await getDriver()).createSubcategory(input);
}

export async function updateSubcategory(input: { oldSlug: string; categoryId: number; name: string; description?: string }) {
  return (await getDriver()).updateSubcategory(input);
}

export async function deleteSubcategory(slug: string) {
  return (await getDriver()).deleteSubcategory(slug);
}

export async function updateProduct(input: Parameters<SqliteDriver["updateProduct"]>[0]) {
  return (await getDriver()).updateProduct(input);
}

export async function createProduct(input: Parameters<SqliteDriver["createProduct"]>[0]) {
  return (await getDriver()).createProduct(input);
}

export async function setProductActive(id: number, active: boolean) {
  return (await getDriver()).setProductActive(id, active);
}

export async function updateInventory(variantId: number, branchId: number, quantity: number) {
  return (await getDriver()).updateInventory(variantId, branchId, quantity);
}

export async function getInventoryQuantity(variantId: number, branchId: number) {
  return (await getDriver()).getInventoryQuantity(variantId, branchId);
}

export async function addInventory(variantId: number, branchId: number, delta: number) {
  return (await getDriver()).addInventory(variantId, branchId, delta);
}

export async function createOrder(input: {
  name: string;
  phone: string;
  email: string;
  fulfillment: string;
  branchId: number;
  source?: string;
  address?: string;
  distanceKm?: number | null;
  items: CartItemPayload[];
}) {
  return (await getDriver()).createOrder(input);
}

export async function createWholesaleOrder(input: Parameters<SqliteDriver["createWholesaleOrder"]>[0]) {
  return (await getDriver()).createWholesaleOrder(input);
}

export async function updateOrderPayment(input: { id: number; paidCents: number; paymentMethod?: string }) {
  return (await getDriver()).updateOrderPayment(input);
}

export async function updateOrder(input: Parameters<SqliteDriver["updateOrder"]>[0]) {
  return (await getDriver()).updateOrder(input);
}

export async function deleteOrder(id: number) {
  return (await getDriver()).deleteOrder(id);
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
