import { releaseExpiredReservations } from "@/lib/db";
import { getMercadoPagoPayment } from "@/lib/mercadopago";
import { applyMercadoPagoPayment } from "@/lib/mercadopago-sync";
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
    // Aprovecha cada aviso de Mercado Pago para liberar reservas vencidas (liberación perezosa, sin cron).
    await releaseExpiredReservations({ force: true });
    const payment = await getMercadoPagoPayment(paymentId);
    // Mismo criterio que la conciliación periódica (lib/mercadopago-sync.ts).
    await applyMercadoPagoPayment(payment, paymentId, { fromWebhook: true });
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
