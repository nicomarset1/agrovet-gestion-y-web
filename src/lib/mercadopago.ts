import "server-only";

import { orderToken } from "./order-token";
import { excludeCashTickets, mercadoPagoDate } from "./reservation";

type PreferenceInput = {
  code: string;
  totalCents: number;
  // Vencimiento de la reserva de stock: el link de pago (y un ticket, si se permitieran) vence a esa hora.
  reservedUntil?: string;
  payer: {
    name: string;
    email: string;
    phone: string;
  };
};

type PreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

export type MercadoPagoPayment = {
  id?: number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_method_id?: string;
  payment_type_id?: string;
};

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  return "";
}

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Falta configurar MERCADOPAGO_ACCESS_TOKEN.");
  return token;
}

export async function createMercadoPagoPreference(input: PreferenceInput) {
  const siteUrl = getSiteUrl();
  const body: Record<string, unknown> = {
    items: [
      {
        id: input.code,
        title: `Pedido ${input.code} - Agrovet Mar del Plata`,
        quantity: 1,
        unit_price: input.totalCents / 100,
        currency_id: "ARS",
      },
    ],
    payer: {
      name: input.payer.name,
      email: input.payer.email,
      phone: {
        number: input.payer.phone,
      },
    },
    external_reference: input.code,
    statement_descriptor: "AGROVET MDP",
    ...(input.reservedUntil ? {
      expires: true,
      expiration_date_from: mercadoPagoDate(new Date()),
      expiration_date_to: mercadoPagoDate(new Date(input.reservedUntil)),
      date_of_expiration: mercadoPagoDate(new Date(input.reservedUntil)),
    } : {}),
    // Pagos en efectivo diferidos (tickets como Rapipago y Pago Fácil, y cajeros): pueden acreditarse después
    // de que vence la reserva. Decisión del negocio: el efectivo se paga en la sucursal.
    ...(excludeCashTickets ? {
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        excluded_payment_methods: [{ id: "rapipago" }, { id: "pagofacil" }],
      },
    } : {}),
    metadata: {
      order_code: input.code,
    },
  };

  if (siteUrl.startsWith("https://")) {
    // El token prueba que quien vuelve es quien inició el pago: sin él, abandonar no libera la reserva.
    const returnUrl = `${siteUrl}/api/mercadopago/return?token=${orderToken(input.code)}`;
    body.back_urls = {
      success: returnUrl,
      failure: returnUrl,
      pending: returnUrl,
    };
    body.auto_return = "approved";
    body.notification_url = `${siteUrl}/api/mercadopago/webhook`;
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null) as Partial<PreferenceResponse> & { message?: string };
  if (!response.ok || !data?.id) {
    throw new Error(data?.message ?? "No se pudo iniciar Mercado Pago.");
  }

  const paymentUrl = data.init_point ?? data.sandbox_init_point ?? "";
  if (!paymentUrl) throw new Error("Mercado Pago no devolvió un link de pago.");

  return {
    preferenceId: data.id,
    paymentUrl,
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message ?? `No se pudo consultar el pago en Mercado Pago (${response.status}).`);
  }
  return response.json() as Promise<MercadoPagoPayment>;
}

// Pagos de un pedido (external_reference = código del pedido), del más viejo al más nuevo. Solo lectura.
export async function searchMercadoPagoPaymentsByReference(code: string) {
  const params = new URLSearchParams({ external_reference: code, sort: "date_created", criteria: "asc" });
  const response = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, {
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(data?.message ?? `No se pudieron buscar los pagos en Mercado Pago (${response.status}).`);
  }
  const data = await response.json() as { results?: MercadoPagoPayment[] };
  return (data.results ?? []).filter((payment) => payment.external_reference === code);
}

export function hasMercadoPagoAccessToken() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
}

// Devolución o contracargo: la plata ya no está, pero la mercadería puede haber salido. Lo decide una persona.
export function isRefundedPayment(payment: MercadoPagoPayment) {
  return payment.status === "refunded" || payment.status === "charged_back";
}

export function paymentAmountCents(payment: MercadoPagoPayment) {
  if (typeof payment.transaction_amount !== "number" || !Number.isFinite(payment.transaction_amount)) {
    return null;
  }
  return Math.round(payment.transaction_amount * 100);
}

export function mercadoPagoMethodLabel(payment: MercadoPagoPayment) {
  const method = payment.payment_method_id?.trim();
  return method ? `Mercado Pago (${method})` : "Mercado Pago";
}
