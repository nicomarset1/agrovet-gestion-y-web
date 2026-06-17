import { markOrderPaidByCode } from "@/lib/db";
import { getMercadoPagoPayment } from "@/lib/mercadopago";

function getPaymentId(url: URL, body: unknown) {
  const queryId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (queryId) return queryId;
  if (body && typeof body === "object") {
    const payload = body as { data?: { id?: string | number }; id?: string | number };
    return payload.data?.id?.toString() ?? payload.id?.toString() ?? "";
  }
  return "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const paymentId = getPaymentId(new URL(request.url), body);
  if (!paymentId) return Response.json({ ok: true });

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    if (payment.status === "approved" && payment.external_reference) {
      await markOrderPaidByCode(payment.external_reference, "Mercado Pago");
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
