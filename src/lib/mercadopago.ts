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
  status?: string;
  external_reference?: string;
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
  };

  if (siteUrl.startsWith("https://")) {
    body.back_urls = {
      success: `${siteUrl}/carrito?payment=success&order=${input.code}`,
      failure: `${siteUrl}/carrito?payment=failure&order=${input.code}`,
      pending: `${siteUrl}/carrito?payment=pending&order=${input.code}`,
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

  return {
    preferenceId: data.id,
    paymentUrl: data.init_point ?? data.sandbox_init_point ?? "",
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      authorization: `Bearer ${getAccessToken()}`,
    },
  });
  if (!response.ok) throw new Error("No se pudo consultar el pago en Mercado Pago.");
  return response.json() as Promise<MercadoPagoPayment>;
}
