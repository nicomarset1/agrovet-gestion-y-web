import { markOrderPaidByCode } from "@/lib/db";
import { getMercadoPagoPayment, mercadoPagoMethodLabel, paymentAmountCents } from "@/lib/mercadopago";
import { hasMercadoPagoWebhookSecret, validateMercadoPagoWebhookSignature } from "@/lib/mercadopago-webhook";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => null);
  const bodyType = body && typeof body === "object"
    ? ((body as { type?: string; topic?: string }).type ?? (body as { type?: string; topic?: string }).topic ?? "")
    : "";
  const bodyPaymentId = body && typeof body === "object"
    ? String((body as { data?: { id?: string | number } }).data?.id ?? "").trim()
    : "";
  const paymentId = url.searchParams.get("data.id")?.trim() ?? url.searchParams.get("id")?.trim() ?? bodyPaymentId;
  const type = url.searchParams.get("type")?.trim() ?? url.searchParams.get("topic")?.trim() ?? bodyType;
  if (!paymentId) return Response.json({ ok: true });
  if (type && type !== "payment") return Response.json({ ok: true });
  if (hasMercadoPagoWebhookSecret() && !validateMercadoPagoWebhookSignature(request, paymentId)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    if (payment.status === "approved" && payment.external_reference) {
      const amountCents = paymentAmountCents(payment);
      if (amountCents === null) throw new Error("Mercado Pago no informó un importe válido.");
      const reconciliation = await markOrderPaidByCode(payment.external_reference, mercadoPagoMethodLabel(payment), amountCents);
      if (reconciliation !== "paid") {
        console.error("Mercado Pago webhook: pago aprobado que requiere revisión", {
          paymentId,
          order: payment.external_reference,
          reconciliation,
        });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Mercado Pago webhook error", {
      message: error instanceof Error ? error.message : String(error),
      paymentId,
      type,
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
