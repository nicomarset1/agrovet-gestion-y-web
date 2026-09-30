import { z } from "zod";
import { createOrder, discardUnpaidOrder } from "@/lib/db";
import { createMercadoPagoPreference } from "@/lib/mercadopago";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { forbiddenMutationResponse, isSameOriginMutation, readBoundedJson } from "@/lib/request-security";

const orderSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(8).max(30),
  email: z.email(),
  fulfillment: z.enum(["retiro", "envio"]),
  paymentMethod: z.enum(["mercado_pago", "efectivo"]),
  address: z.string().trim().max(160).optional(),
  distanceKm: z.number().min(0).max(100).nullable().optional(),
  branchId: z.number().int().positive(),
  items: z.array(z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(30),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return forbiddenMutationResponse();

  const limit = rateLimit(`orders:${clientKey(request)}`, 6, 60_000);
  if (limit.limited) {
    return tooManyRequests(limit.retryAfterSeconds, "Demasiados pedidos seguidos. Probá de nuevo en un momento.");
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return Response.json({ error: "Revisa los datos del pedido." }, { status: 400 });
  }
  const result = orderSchema.safeParse(body);
  if (!result.success) {
    return Response.json({ error: "Revisa los datos del pedido." }, { status: 400 });
  }
  if (result.data.fulfillment === "envio" && result.data.paymentMethod !== "mercado_pago") {
    return Response.json({ error: "Los envíos solo se pueden pagar con Mercado Pago." }, { status: 400 });
  }
  // La distancia la calcula /api/delivery-zone en el navegador; acá se exige que esté y que sea de la zona.
  if (result.data.fulfillment === "envio" && (!result.data.address?.trim() || typeof result.data.distanceKm !== "number" || result.data.distanceKm > 3)) {
    return Response.json({ error: "Para envío gratis necesitamos una dirección verificada dentro de 3 km de Alberti 3213." }, { status: 400 });
  }
  try {
    const order = await createOrder({
      ...result.data,
      source: "Tienda online",
    });
    if (result.data.paymentMethod === "mercado_pago") {
      try {
        const preference = await createMercadoPagoPreference({
          code: order.code,
          totalCents: order.totalCents,
          payer: {
            name: result.data.name,
            email: result.data.email,
            phone: result.data.phone,
          },
        });
        return Response.json({ ...order, ...preference }, { status: 201 });
      } catch (error) {
        // Sin preferencia el cliente no puede pagar: el pedido se descarta para no dejarlo huérfano.
        console.error("No se pudo crear la preferencia de Mercado Pago", {
          order: order.code,
          message: error instanceof Error ? error.message : String(error),
        });
        await discardUnpaidOrder(order.code).catch((discardError: unknown) => {
          console.error("No se pudo descartar el pedido sin preferencia", {
            order: order.code,
            message: discardError instanceof Error ? discardError.message : String(discardError),
          });
        });
        return Response.json({ error: "No pudimos abrir Mercado Pago. Probá de nuevo en unos minutos." }, { status: 502 });
      }
    }
    return Response.json(order, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo reservar stock." }, { status: 409 });
  }
}
