// Clasificación de ventas por medio de pago y canal. La usan la sección Ventas, el Dashboard y el PDF:
// cuando cada uno tenía la suya, el mismo período daba Efectivo $700 en el desglose y $100 en el filtro.

import { reservedStatus } from "./reservation";

export type PaymentKind = "efectivo" | "tarjeta" | "transferencia" | "qr" | "mercado-pago" | "cuenta-corriente" | "otro";

export type SalesChannel = "store" | "web" | "wholesale";

const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  qr: "QR",
  "mercado-pago": "Mercado Pago",
  "cuenta-corriente": "Cuenta corriente",
  otro: "Otro",
};

export function paymentKindLabel(kind: PaymentKind) {
  return PAYMENT_KIND_LABELS[kind] ?? kind;
}

// Opciones del filtro, sin "otro": ese aparece solo si hay ventas así (ver paymentFilterOptions).
const PAYMENT_KINDS: PaymentKind[] = ["efectivo", "tarjeta", "transferencia", "qr", "mercado-pago", "cuenta-corriente"];

export function paymentFilterOptions(orders: { source: string; paymentMethod: string }[]) {
  const kinds = orders.some((order) => paymentKindOf(order) === "otro") ? [...PAYMENT_KINDS, "otro" as const] : PAYMENT_KINDS;
  return kinds.map((kind) => ({ value: kind as string, label: paymentKindLabel(kind) }));
}

// Es el medio con el que se cobró, sea cual sea el canal: el canal tiene su propio filtro. En Caja el medio
// vive en source ("Caja / Tarjeta (3 cuotas)"); payment_method queda siempre en "Efectivo en sucursal".
export function paymentKindOf(order: { source: string; paymentMethod: string }): PaymentKind {
  const cash = /^Caja \/ ([^(]+)/i.exec(order.source);
  const raw = (cash ? cash[1] : order.paymentMethod || "").trim();
  if (/mercado ?pago/i.test(raw)) return "mercado-pago";
  if (/efectivo/i.test(raw)) return "efectivo";
  if (/tarjeta/i.test(raw)) return "tarjeta";
  if (/transferencia/i.test(raw)) return "transferencia";
  if (/\bqr\b/i.test(raw)) return "qr";
  if (/cuenta corriente/i.test(raw)) return "cuenta-corriente";
  return "otro";
}

export function salesChannelOf(source: string): SalesChannel {
  if (/^Caja\b/i.test(source)) return "store";
  if (/^Mayorista\b/i.test(source)) return "wholesale";
  return "web";
}

// Pedido web sin cobrar (reservado o esperando a Mercado Pago): todavía no es una venta.
export function isUnpaidOnlineOrder(order: { source: string; status: string; paymentMethod: string; paidCents: number; totalCents: number }) {
  if (salesChannelOf(order.source) !== "web") return false;
  if (order.status === reservedStatus) return true;
  return /mercado pago/i.test(order.paymentMethod) && order.paidCents < order.totalCents && /pendiente de pago|esperando pago/i.test(order.status);
}
