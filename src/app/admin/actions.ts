"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endAdminSession, getLoginRateLimit, isValidAdminPassword, recordLoginAttempt, requireAdmin, startAdminSession } from "@/lib/auth";
import {
  createCategory,
  createWholesaleClient,
  createWholesaleOrder,
  createSubcategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  deleteOrder,
  deleteSubcategory,
  deleteWholesaleClient,
  addInventory,
  updateOrder,
  updateOrderPayment,
  updateCategory,
  updateProduct,
  updateSubcategory,
  updateWholesaleClient,
} from "@/lib/db";

export type LoginState = { error?: string };

function loginIdentifier(headersList: Headers) {
  const forwardedFor = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headersList.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "local";
}

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const identifier = loginIdentifier(await headers());
  const rateLimit = await getLoginRateLimit(identifier);
  if (rateLimit.limited) {
    const minutes = Math.max(1, Math.ceil(rateLimit.retryAfterSeconds / 60));
    return { error: `Demasiados intentos. Probá de nuevo en ${minutes} min.` };
  }
  if (!isValidAdminPassword(password)) {
    await recordLoginAttempt(identifier, false);
    return { error: "Código incorrecto." };
  }
  await recordLoginAttempt(identifier, true);
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/");
}

const stockSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(0).max(99999),
  returnTo: z.string().trim().min(1).optional(),
});

export async function updateStockAction(formData: FormData) {
  await requireAdmin();
  const parsed = stockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Cantidad de stock inválida.");
  await addInventory(parsed.data.variantId, parsed.data.branchId, parsed.data.quantity);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

const wholesaleClientSchema = z.object({
  businessName: z.string().trim().min(2).max(140),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
  address: z.string().trim().max(180).optional(),
  taxId: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(300).optional(),
  returnTo: z.string().trim().min(1).optional(),
});

export async function createWholesaleClientAction(formData: FormData) {
  await requireAdmin();
  const parsed = wholesaleClientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Cliente inválido.");
  await createWholesaleClient(parsed.data);
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function updateWholesaleClientAction(formData: FormData) {
  await requireAdmin();
  const parsed = wholesaleClientSchema.extend({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Cliente inválido.");
  await updateWholesaleClient({
    id: parsed.data.id,
    businessName: parsed.data.businessName,
    contactName: parsed.data.contactName ?? "",
    phone: parsed.data.phone ?? "",
    email: parsed.data.email ?? "",
    address: parsed.data.address ?? "",
    taxId: parsed.data.taxId ?? "",
    notes: parsed.data.notes ?? "",
    createdAt: "",
  });
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function deleteWholesaleClientAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
    returnTo: z.string().trim().min(1).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Cliente inválido.");
  await deleteWholesaleClient(parsed.data.id);
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

const wholesaleOrderSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  paymentMethod: z.string().trim().max(80).optional(),
  paidAmount: z.string().trim().optional().refine((value) => !value || Number.isFinite(Number(value)), "Monto inválido"),
  notes: z.string().trim().max(180).optional(),
  returnTo: z.string().trim().min(1).optional(),
});

export async function createWholesaleOrderAction(formData: FormData) {
  await requireAdmin();
  const parsed = wholesaleOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Pedido mayorista inválido.");
  const variantIds = formData.getAll("itemVariantId").map((value) => z.coerce.number().int().positive().parse(value));
  const quantities = formData.getAll("itemQuantity").map((value) => z.coerce.number().int().min(1).max(99999).parse(value));
  const branchIds = formData.getAll("itemBranchId").map((value) => z.coerce.number().int().positive().parse(value));
  if (!variantIds.length || variantIds.length !== quantities.length || quantities.length !== branchIds.length) {
    throw new Error("Agregá productos válidos al pedido.");
  }
  await createWholesaleOrder({
    clientId: parsed.data.clientId,
    branchId: parsed.data.branchId,
    paymentMethod: parsed.data.paymentMethod ?? "",
    paidCents: parsed.data.paymentMethod === "Cuenta corriente"
      ? Math.round(Number(parsed.data.paidAmount || "0") * 100)
      : undefined,
    notes: parsed.data.notes ?? "",
    items: variantIds.map((variantId, index) => ({ variantId, quantity: quantities[index], branchId: branchIds[index] })),
  });
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

const orderPaymentSchema = z.object({
  id: z.coerce.number().int().positive(),
  paidAmount: z.coerce.number().min(0).max(999999999),
  paymentMethod: z.string().trim().max(80).optional(),
  returnTo: z.string().trim().min(1).optional(),
});

export async function updateOrderPaymentAction(formData: FormData) {
  await requireAdmin();
  const parsed = orderPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Pago inválido.");
  await updateOrderPayment({
    id: parsed.data.id,
    paidCents: Math.round(parsed.data.paidAmount * 100),
    paymentMethod: parsed.data.paymentMethod ?? "",
  });
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

const categorySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2500).optional(),
  showInMenu: z.enum(["on"]).optional(),
  parentCategoryId: z.coerce.number().int().positive().optional(),
  returnTo: z.string().trim().min(1).optional(),
});

function appendFlash(url: string, flash: string) {
  const next = new URL(url, "http://127.0.0.1:3000");
  next.searchParams.set("flash", flash);
  return `${next.pathname}${next.search}`;
}

export async function createCategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Categoría inválida.");
  await createCategory({
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    showInMenu: parsed.data.showInMenu === "on",
    parentCategoryId: parsed.data.showInMenu === "on" ? null : parsed.data.parentCategoryId ?? null,
  });
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function updateCategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = categorySchema.extend({ id: z.coerce.number().int().positive(), slug: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Categoría inválida.");
  await updateCategory({
    ...parsed.data,
    showInMenu: parsed.data.showInMenu === "on",
    parentCategoryId: parsed.data.showInMenu === "on" ? null : parsed.data.parentCategoryId ?? null,
  });
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
    returnTo: z.string().trim().min(1).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Categoría inválida.");
  const { id, returnTo } = parsed.data;
  await deleteCategory(id);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  redirect(appendFlash(returnTo ?? "/admin?section=categorias", "category-deleted"));
}

const subcategorySchema = z.object({
  oldSlug: z.string().trim().min(1).max(100),
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(180).optional(),
  returnTo: z.string().trim().min(1).optional(),
});

export async function createSubcategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = subcategorySchema.omit({ oldSlug: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Subcategoría inválida.");
  await createSubcategory(parsed.data);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function updateSubcategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = subcategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Subcategoría inválida.");
  await updateSubcategory(parsed.data);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function deleteSubcategoryAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    slug: z.string().trim().min(1).max(100),
    returnTo: z.string().trim().min(1).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Subcategoría inválida.");
  const { slug, returnTo } = parsed.data;
  await deleteSubcategory(slug);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  redirect(appendFlash(returnTo ?? "/admin?section=categorias", "subcategory-deleted"));
}

const uncategorizedCategoryValue = "__none";
const uncategorizedSubcategorySlug = "sin-subcategoria";
const categoryIdSchema = z.preprocess((value) => {
  if (value === uncategorizedCategoryValue || value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.number().int().positive().nullable());

const productBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(2).max(80),
  categoryId: categoryIdSchema,
  species: z.enum(["perro", "gato", "perro-gato"]),
  subcategorySlug: z.string().trim().min(1).max(100).transform((value) => value === "__none" ? uncategorizedSubcategorySlug : value),
  lifeStage: z.string().trim().max(40).optional(),
  size: z.string().trim().max(40).optional(),
  need: z.string().trim().max(60).optional(),
  description: z.string().trim().min(8).max(500),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  imageUrl: z.string().trim().optional(),
  featured: z.enum(["on"]).optional(),
  requiresAdvice: z.enum(["on"]).optional(),
  returnTo: z.string().trim().min(1),
});

const variantRowSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  label: z.string().trim().min(1).max(60),
  sku: z.string().trim().min(3).max(80),
  barcode: z.string().trim().max(80).optional().default(""),
  price: z.coerce.number().min(1).max(99999999),
  stock1: z.coerce.number().int().min(0).max(99999),
  stock2: z.coerce.number().int().min(0).max(99999),
});

function readVariantRows(formData: FormData) {
  const ids = formData.getAll("variantId").map((value) => String(value).trim()).filter(Boolean);
  const labels = formData.getAll("variantLabel").map((value) => String(value).trim());
  const skus = formData.getAll("variantSku").map((value) => String(value).trim());
  const barcodes = formData.getAll("variantBarcode").map((value) => String(value).trim());
  const prices = formData.getAll("variantPrice").map((value) => String(value));
  const stock1s = formData.getAll("variantStock1").map((value) => String(value));
  const stock2s = formData.getAll("variantStock2").map((value) => String(value));
  const rows = labels.map((_, index) => ({
    id: ids[index] ? Number(ids[index]) : undefined,
    label: labels[index],
    sku: skus[index],
    barcode: barcodes[index] || "",
    price: prices[index],
    stock1: stock1s[index],
    stock2: stock2s[index],
  }));
  const parsed = rows.map((row) => variantRowSchema.safeParse(row));
  if (parsed.some((row) => !row.success)) throw new Error("Las presentaciones son inválidas.");
  return parsed.map((row) => row.success ? row.data : null).filter(Boolean) as Array<z.infer<typeof variantRowSchema>>;
}

export async function createProductAction(formData: FormData) {
  await requireAdmin();
  const parsed = productBaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Producto inválido.");
  const variants = readVariantRows(formData);
  if (!variants.length) throw new Error("Agregá al menos una presentación.");
  await createProduct({
    ...parsed.data,
    featured: parsed.data.featured === "on",
    requiresAdvice: parsed.data.requiresAdvice === "on",
    imageUrl: parsed.data.imageUrl ?? "",
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      priceCents: Math.round(variant.price * 100),
      stockByBranch: [
        { branchId: 1, quantity: variant.stock1 },
        { branchId: 2, quantity: variant.stock2 },
      ],
    })),
  });
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  redirect(parsed.data.returnTo);
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  await deleteProduct(id);
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
}

const orderSchema = z.object({
  id: z.coerce.number().int().positive(),
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email(),
  fulfillment: z.string().trim().min(2).max(60),
  branchId: z.coerce.number().int().positive(),
  deliveryAddress: z.string().trim().max(180).optional(),
  deliveryDistanceKm: z.string().trim().optional(),
  status: z.string().trim().min(2).max(80),
  source: z.string().trim().min(2).max(80),
  paymentMethod: z.string().trim().max(80).optional(),
  returnTo: z.string().trim().min(1).optional(),
});

export async function updateOrderAction(formData: FormData) {
  await requireAdmin();
  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Registro inválido.");
  const variantIds = formData.getAll("itemVariantId").map((value) => z.coerce.number().int().positive().parse(value));
  const quantities = formData.getAll("itemQuantity").map((value) => z.coerce.number().int().min(1).max(9999).parse(value));
  if (!variantIds.length || variantIds.length !== quantities.length) throw new Error("Los productos del pedido son inválidos.");
  const allocationVariantIds = formData.getAll("allocationVariantId").map((value) => z.coerce.number().int().positive().parse(value));
  const allocationBranchIds = formData.getAll("allocationBranchId").map((value) => z.coerce.number().int().positive().parse(value));
  const allocationQuantities = formData.getAll("allocationQuantity").map((value) => z.coerce.number().int().min(1).max(9999).parse(value));
  if ((allocationVariantIds.length || allocationBranchIds.length || allocationQuantities.length) && !(allocationVariantIds.length === allocationBranchIds.length && allocationBranchIds.length === allocationQuantities.length)) {
    throw new Error("La distribución del pedido es inválida.");
  }
  const deliveryDistanceKm = parsed.data.deliveryDistanceKm?.length ? Number(parsed.data.deliveryDistanceKm) : null;
  if (deliveryDistanceKm !== null && !Number.isFinite(deliveryDistanceKm)) throw new Error("La distancia de envío es inválida.");
  await updateOrder({
    id: parsed.data.id,
    customerName: parsed.data.customerName,
    phone: parsed.data.phone,
    email: parsed.data.email,
    fulfillment: parsed.data.fulfillment,
    branchId: parsed.data.branchId,
    deliveryAddress: parsed.data.deliveryAddress,
    deliveryDistanceKm,
    status: parsed.data.status,
    source: parsed.data.source,
    paymentMethod: parsed.data.paymentMethod ?? "",
    items: variantIds.map((variantId, index) => ({ variantId, quantity: quantities[index] })),
    allocations: allocationVariantIds.length
      ? variantIds.map((variantId) => ({
        variantId,
        allocations: allocationVariantIds
          .map((allocationVariantId, index) => allocationVariantId === variantId ? { branchId: allocationBranchIds[index], quantity: allocationQuantities[index] } : null)
          .filter((value): value is { branchId: number; quantity: number } => Boolean(value)),
      }))
      : undefined,
  });
  revalidatePath("/admin");
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
}

export async function deleteOrderAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
    returnTo: z.string().trim().min(1).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Registro inválido.");
  const { id, returnTo } = parsed.data;
  await deleteOrder(id);
  revalidatePath("/admin");
  if (returnTo) redirect(returnTo);
}

const productUpdateSchema = productBaseSchema.extend({
  id: z.coerce.number().int().positive(),
});

export async function updateProductAction(formData: FormData) {
  await requireAdmin();
  const parsed = productUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Producto inválido.");
  const variants = readVariantRows(formData);
  if (!variants.length) throw new Error("Agregá al menos una presentación.");
  await updateProduct({
    id: parsed.data.id,
    name: parsed.data.name,
    brand: parsed.data.brand,
    categoryId: parsed.data.categoryId,
    species: parsed.data.species,
    subcategorySlug: parsed.data.subcategorySlug,
    lifeStage: parsed.data.lifeStage,
    size: parsed.data.size,
    need: parsed.data.need,
    description: parsed.data.description,
    featured: parsed.data.featured === "on",
    requiresAdvice: parsed.data.requiresAdvice === "on",
    color: parsed.data.color,
    imageUrl: parsed.data.imageUrl ?? "",
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      barcode: variant.barcode,
      priceCents: Math.round(variant.price * 100),
      stockByBranch: [
        { branchId: 1, quantity: variant.stock1 },
        { branchId: 2, quantity: variant.stock2 },
      ],
    })),
  });
  revalidatePath("/");
  revalidatePath("/tienda");
  revalidatePath("/admin");
  redirect(parsed.data.returnTo);
}
