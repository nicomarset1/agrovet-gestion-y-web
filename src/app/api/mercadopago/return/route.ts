import { redirect } from "next/navigation";
import { markOrderPaidByCode } from "@/lib/db";
import { getMercadoPagoPayment, mercadoPagoMethodLabel, paymentAmountCents } from "@/lib/mercadopago";

function cartUrl(request: Request, params: Record<string, string>) {
  const url = new URL("/carrito", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = (url.searchParams.get("payment_id") ?? url.searchParams.get("collection_id") ?? "").trim();
  const returnedOrder = (url.searchParams.get("external_reference") ?? "").trim();

  if (!paymentId) {
    redirect(cartUrl(request, {
      payment: "failure",
      order: returnedOrder,
      reason: "missing_payment",
    }));
  }

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    const order = payment.external_reference?.trim() ?? "";
    const amountCents = paymentAmountCents(payment);

    if (!order || (returnedOrder && returnedOrder !== order) || amountCents === null) {
      redirect(cartUrl(request, { payment: "failure", order: returnedOrder, reason: "invalid_payment" }));
    }

    if (payment.status === "approved") {
      const reconciled = await markOrderPaidByCode(order, mercadoPagoMethodLabel(payment), amountCents);
      redirect(cartUrl(request, {
        payment: reconciled ? "success" : "failure",
        order,
        reason: reconciled ? "" : "amount_mismatch",
      }));
    }

    if (payment.status === "pending" || payment.status === "in_process" || payment.status === "authorized") {
      redirect(cartUrl(request, { payment: "pending", order }));
    }

    redirect(cartUrl(request, {
      payment: "failure",
      order,
      reason: payment.status_detail ?? payment.status ?? "rejected",
    }));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("Mercado Pago return reconciliation error", {
      message: error instanceof Error ? error.message : String(error),
      paymentId,
    });
    redirect(cartUrl(request, { payment: "pending", order: returnedOrder, reason: "verification_error" }));
  }
}
