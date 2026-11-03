// Estados de pedido y reglas de cobro (módulo puro): lo usan los dos drivers y el panel, así no pueden divergir.
import { reservedStatus } from "./reservation";

export const webCashPaymentMethod = "Efectivo en sucursal";

// Cobrado pero no concilia: este pedido NO tiene stock tomado.
export const paymentReviewStatus = "Pago recibido - revisar";
export const paymentStockReviewStatus = "Pago recibido - revisar stock";
// Cobrado con algo raro (segundo cobro, unidades sumadas después del pago) y con el stock todavía tomado.
export const chargeReviewStatus = "Cobro a revisar";
// Mercado Pago informó devolución o contracargo: el stock sigue retenido hasta que alguien decida.
export const refundReviewStatus = "Devolución - revisar";

export function isCanceledStatus(status: string) {
  return /cancelad/i.test(status);
}

// Pedidos de Mercado Pago sin cobro que NO tienen stock tomado: los "Esperando pago" anteriores a la
// reserva y los cancelados sin pago (reserva vencida o pago no completado, ya devolvieron el stock).
// Si después llega un pago aprobado, markOrderPaidByCode los reactiva descontando el stock de nuevo.
export function isAwaitingPaymentStatus(status: string) {
  return /^(Esperando pago|Pendiente de pago|Cancelado \(pago no completado\)|Cancelado \(reserva vencida\))$/i.test(status.trim());
}

// Un pedido tiene stock tomado salvo que esté cancelado, esperando el cobro de Mercado Pago
// o pagado pendiente de revisión sin stock: esos nunca descontaron stock, así que tampoco hay que devolverlo.
export function holdsStock(status: string) {
  return !isCanceledStatus(status) && !isAwaitingPaymentStatus(status) && !/^Pago recibido - revisar/i.test(status.trim());
}

// Todo lo que una persona tiene que mirar antes de cerrar el pedido.
export function isReviewStatus(status: string) {
  return /revisar/i.test(status);
}

type IncomeOrder = { source: string; status: string; paymentMethod: string; paidCents: number; totalCents: number };

// Pedido web a pagar en efectivo en sucursal que todavía no se cobró. Mercado Pago, Caja y mayoristas no entran.
export function isUncollectedCashOrder(order: IncomeOrder) {
  return /^Tienda online/i.test(order.source) && /efectivo/i.test(order.paymentMethod) && order.paidCents < order.totalCents;
}

// No suma a ingresos (panel y PDF): la plata todavía no entró, o Mercado Pago ya la devolvió.
export function isExcludedFromIncome(order: IncomeOrder) {
  return isUncollectedCashOrder(order) || order.status.trim() === refundReviewStatus;
}

// payment_ref guarda los ids de pago de Mercado Pago de un pedido, separados por coma.
export function parsePaymentRefs(value: string | null | undefined) {
  return (value ?? "").split(",").map((ref) => ref.trim()).filter(Boolean);
}

export type PaymentReconciliation = "paid" | "review" | "missing";

export type ApprovedPaymentPlan =
  | { action: "none"; result: Exclude<PaymentReconciliation, "missing">; paymentRef: string }
  | { action: "settle-reserved"; paymentRef: string }
  | { action: "review-keep-stock"; paidCents: number; paymentRef: string }
  | { action: "review-no-stock"; restoreStock: boolean; paidCents: number; paymentRef: string }
  | { action: "reactivate"; paymentRef: string };

// Decide qué hacer con un pago aprobado. Cada driver solo ejecuta el plan, dentro de su transacción con el pedido bloqueado.
export function planApprovedPayment(
  order: { status: string; paidCents: number; totalCents: number; deleted: boolean; paymentRef: string | null | undefined },
  amountCents: number,
  paymentRef = "",
): ApprovedPaymentPlan {
  const ref = paymentRef.trim();
  const refs = parsePaymentRefs(order.paymentRef);
  const repeated = Boolean(ref) && refs.includes(ref);
  const nextRef = (ref && !repeated ? [...refs, ref] : refs).join(",");
  const status = order.status.trim();
  const deleted = order.deleted;
  const reserved = !deleted && status === reservedStatus;
  const awaiting = !deleted && isAwaitingPaymentStatus(status);
  const inReview = isReviewStatus(status);
  const retainsStock = !deleted && !reserved && holdsStock(status);
  const paidInFull = order.paidCents >= order.totalCents;
  const validAmount = Number.isSafeInteger(amountCents) && amountCents > 0;
  const amountMatches = validAmount && amountCents === order.totalCents;
  // Lo ya cobrado no se pisa: un segundo cobro queda en payment_ref y en el log, no en paid_cents.
  const collected = order.paidCents > 0 ? order.paidCents : validAmount ? amountCents : 0;

  // Mismo id de pago (vuelta del checkout + webhook, o webhook repetido): nada se acredita dos veces.
  if (repeated) {
    // Le subieron unidades después de pagar: queda marcado sin mover stock ni lo cobrado.
    if (retainsStock && !inReview && !paidInFull) return { action: "review-keep-stock", paidCents: order.paidCents, paymentRef: nextRef };
    return { action: "none", result: inReview || deleted ? "review" : "paid", paymentRef: nextRef };
  }

  // Reserva vigente (aunque ya pasaron las 12 h, si todavía no se liberó): el stock ya está descontado.
  if (reserved && amountMatches) return { action: "settle-reserved", paymentRef: nextRef };

  // Sin id con qué comparar: es un pedido pagado antes de existir la columna, o un llamado sin id. Sin falsa alarma.
  const nothingToCompare = refs.length === 0 || !ref;

  if (retainsStock) {
    if (inReview) return { action: "none", result: "review", paymentRef: nextRef };
    if (nothingToCompare && paidInFull) return { action: "none", result: "paid", paymentRef: nextRef };
    // Otro id sobre un pedido cobrado, unidades sumadas o cobro sobre un pedido en efectivo: el stock sigue tomado.
    return { action: "review-keep-stock", paidCents: collected, paymentRef: nextRef };
  }

  if (!deleted && inReview) return { action: "none", result: "review", paymentRef: nextRef };
  if (!deleted && !awaiting && !reserved && nothingToCompare && paidInFull) return { action: "none", result: "paid", paymentRef: nextRef };

  // Cobrado pero no concilia (monto distinto, pedido borrado o cancelado desde el panel):
  // queda visible en el panel para revisar, con lo realmente cobrado y sin stock tomado.
  if (!awaiting || !amountMatches) return { action: "review-no-stock", restoreStock: reserved, paidCents: collected, paymentRef: nextRef };

  return { action: "reactivate", paymentRef: nextRef };
}

// Devolución o contracargo: solo pasa a revisión lo que tiene stock tomado. Un cancelado, borrado o una
// revisión sin stock ya no retienen nada: marcarlos haría que al cancelarlos se devuelva stock que no tienen.
export function refundNeedsReview(order: { status: string; deleted: boolean }) {
  return !order.deleted && holdsStock(order.status) && order.status.trim() !== refundReviewStatus;
}
