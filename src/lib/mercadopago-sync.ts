import "server-only";

import { claimPeriodicTask, listMercadoPagoOrderCodes, markOrderPaidByCode, markOrderPaymentFailedByCode, markOrderRefundedByCode } from "@/lib/db";
import { hasMercadoPagoAccessToken, isRefundedPayment, mercadoPagoMethodLabel, paymentAmountCents, searchMercadoPagoPaymentsByReference } from "@/lib/mercadopago";
import type { MercadoPagoPayment } from "@/lib/mercadopago";

// Estados de un pago que ya no se va a acreditar: liberan la reserva. Un "rejected" NO libera: el cliente
// puede reintentar con otra tarjeta en el mismo checkout; si no paga, la reserva vence sola a las 12 h.
const failedPaymentStatuses = new Set(["cancelled", "expired"]);

export type PaymentOutcome = "paid" | "review" | "refunded" | "failed" | "ignored";

// Aplica al pedido lo que dice Mercado Pago de un pago. Lo usan el webhook y la conciliación: mismo criterio
// en los dos caminos. Repetirlo con el mismo pago no cambia nada (el id del pago queda guardado en el pedido).
export async function applyMercadoPagoPayment(payment: MercadoPagoPayment, fallbackId: string, options: { fromWebhook: boolean }): Promise<PaymentOutcome> {
  const code = payment.external_reference;
  if (!code) return "ignored";
  const paymentId = String(payment.id ?? fallbackId);
  if (payment.status === "approved") {
    const amountCents = paymentAmountCents(payment);
    if (amountCents === null) throw new Error("Mercado Pago no informó un importe válido.");
    const reconciliation = await markOrderPaidByCode(code, mercadoPagoMethodLabel(payment), amountCents, paymentId);
    if (reconciliation === "paid") return "paid";
    // La conciliación vuelve a pasar por los pedidos en revisión cada vez: solo el webhook lo deja en el log.
    if (options.fromWebhook) console.error("Mercado Pago: pago aprobado que requiere revisión", { paymentId, order: code, reconciliation });
    return "review";
  }
  if (isRefundedPayment(payment)) return (await markOrderRefundedByCode(code, paymentId)) ? "refunded" : "ignored";
  if (options.fromWebhook && failedPaymentStatuses.has(payment.status ?? "")) {
    return (await markOrderPaymentFailedByCode(code)) ? "failed" : "ignored";
  }
  return "ignored";
}

// Conciliación: si un aviso de Mercado Pago se perdió (por ejemplo la base estuvo sin cuota y se agotaron los
// reintentos del webhook), el pago queda registrado igual en la próxima pasada. Solo consulta los pedidos web
// con Mercado Pago de los últimos días y aplica pagos aprobados y devoluciones. No cancela nada: si un pago no
// se completó, la reserva vence sola.
export async function reconcileMercadoPagoOrders(options: { days?: number } = {}) {
  const summary = { checked: 0, errors: 0 };
  if (!hasMercadoPagoAccessToken()) return summary;
  const codes = await listMercadoPagoOrderCodes(options.days ?? 30);
  for (const code of codes) {
    summary.checked++;
    try {
      const payments = await searchMercadoPagoPaymentsByReference(code);
      // Primero los aprobados: un pedido con un rechazo y después un pago bueno queda pagado.
      const ordered = [...payments].sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved"));
      for (const payment of ordered) await applyMercadoPagoPayment(payment, "", { fromWebhook: false });
    } catch (error) {
      summary.errors++;
      console.error("Conciliación de Mercado Pago: no se pudo revisar un pedido", { code, message: error instanceof Error ? error.message : String(error) });
    }
  }
  // Lo que cambia queda en el log de cada driver (pago acreditado o en revisión); acá solo los errores.
  if (summary.errors) console.error("Conciliación de Mercado Pago con errores", summary);
  return summary;
}

// Corre la conciliación si pasó el intervalo desde la última, contando todas las instancias. Nunca tira error:
// la llaman el panel (después de responder) y el cron diario.
// Antes de tocar la base, cada instancia se frena sola 5 minutos: así llamarla seguido no despierta a Neon.
let lastLocalAttempt = 0;
export async function reconcileMercadoPagoIfDue(everyMinutes = 30) {
  try {
    if (!hasMercadoPagoAccessToken()) return null;
    if (Date.now() - lastLocalAttempt < 5 * 60_000) return null;
    lastLocalAttempt = Date.now();
    if (!(await claimPeriodicTask("mp_reconcile_minute", everyMinutes))) return null;
    return await reconcileMercadoPagoOrders();
  } catch (error) {
    console.error("Conciliación de Mercado Pago falló", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
