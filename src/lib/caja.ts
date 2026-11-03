// Lógica de la Caja sin dependencias de React ni de la base: la comparten la pantalla, los drivers y los pedidos mayoristas.

import { formatPrice } from "./format";

const normalizeCode = (value: string) => value.replace(/\s+/g, "").toLowerCase();

// El sistema guarda las presentaciones con el mismo código de fábrica como 7795628001043-1, -2, etc.
// (uniqueVariantBarcode). El lector lee el código sin sufijo: tiene que encontrar a todas, no solo a la primera.
//
// Lo escrito se compara tal cual: si trae sufijo, se está pidiendo esa presentación puntual. Sacárselo también
// mezclaría códigos propios como RC-MA-1 y RC-MA-3, que son el de 1 kg y el de 3 kg, no repetidos.
export function matchVariantsByCode<T extends { barcode: string; sku: string }>(variants: T[], rawCode: string): T[] {
  const code = normalizeCode(rawCode);
  if (!code) return [];
  return variants.filter((variant) => {
    const barcode = normalizeCode(variant.barcode);
    return barcode === code || normalizeCode(variant.sku) === code || barcode.replace(/-\d+$/, "") === code;
  });
}

export function cajaLineName(line: { brand?: string | null; name: string; label?: string | null }) {
  return [line.brand, line.name, line.label].filter(Boolean).join(" ");
}

export function cajaPriceChangedMessage(name: string, priceCents: number) {
  return `El precio de ${name} cambió: ahora es ${formatPrice(priceCents)}. Revisá la venta.`;
}

export function stockShortageMessage(name: string, available: number, branchName?: string) {
  return `No hay stock suficiente de ${name}: quedan ${Math.max(0, available)}${branchName ? ` en ${branchName}` : ""}.`;
}

export function cajaUnavailableMessage(name: string) {
  return `${name} ya no está en el catálogo. Quitalo de la venta.`;
}

// ===== Venta en curso guardada en sessionStorage =====

export type PosLine = { variantId: number; productName: string; brand: string; label: string; sku: string; barcode: string; quantity: number; priceCents: number; manualPriceCents: number | null; stock: number };

export type PosExtra = { id: number; description: string; amountCents: number };

export type StoredCajaSale = { cart: PosLine[]; extras: PosExtra[]; paymentMethod: string; installments: string; cashDiscountOn: boolean };

const CAJA_PAYMENT_METHODS = ["Efectivo", "Tarjeta", "Transferencia", "QR"];
const CAJA_INSTALLMENTS = ["1", "2", "3", "6", "12"];

export function cajaStorageKey(branchId: number) {
  return `agrovet-caja-venta-${branchId}`;
}

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function isStoredLine(value: unknown): value is PosLine {
  const line = value as Partial<PosLine> | null;
  return Boolean(line)
    && positiveInt(line?.variantId) && positiveInt(line?.quantity)
    && typeof line?.productName === "string" && typeof line?.priceCents === "number"
    && (line?.manualPriceCents === null || positiveInt(line?.manualPriceCents));
}

function isStoredExtra(value: unknown): value is PosExtra {
  const extra = value as Partial<PosExtra> | null;
  return Boolean(extra) && positiveInt(extra?.id) && typeof extra?.description === "string" && positiveInt(extra?.amountCents);
}

// null si no hay nada que recuperar. Lo guardado no se da por bueno: puede ser de una versión anterior
// y los productos pueden haber desaparecido mientras tanto.
export function restoreCajaSale(stored: string | null, knownVariantIds: Set<number>): (StoredCajaSale & { dropped: number }) | null {
  if (!stored) return null;
  let parsed: Partial<StoredCajaSale>;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.cart)) return null;
  const valid = parsed.cart.filter(isStoredLine);
  const cart = valid.filter((line) => knownVariantIds.has(line.variantId));
  const extras = Array.isArray(parsed.extras) ? parsed.extras.filter(isStoredExtra) : [];
  if (!cart.length && !extras.length) return null;
  return {
    cart,
    extras,
    paymentMethod: CAJA_PAYMENT_METHODS.includes(parsed.paymentMethod ?? "") ? parsed.paymentMethod as string : "Efectivo",
    installments: CAJA_INSTALLMENTS.includes(parsed.installments ?? "") ? parsed.installments as string : "1",
    cashDiscountOn: parsed.cashDiscountOn !== false,
    dropped: valid.length - cart.length,
  };
}
