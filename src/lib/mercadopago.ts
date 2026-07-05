import "server-only";

type PreferenceInput = {
  code: string;
  totalCents: number;
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

type MercadoPagoPayment = {
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
    metadata: {
      order_code: input.code,
    },
  };

  if (siteUrl.startsWith("https://")) {
    body.back_urls = {
      success: `${siteUrl}/api/mercadopago/return`,
      failure: `${siteUrl}/api/mercadopago/return`,
      pending: `${siteUrl}/api/mercadopago/return`,
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
