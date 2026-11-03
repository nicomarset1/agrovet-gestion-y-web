import { z } from "zod";
import { createOrder, discardUnpaidOrder, markOrderPaymentFailedByCode } from "@/lib/db";
import { maxOnlineUnitsMessage, maxOnlineUnitsPerProduct } from "@/lib/format";
import { geocodeDeliveryAddress } from "@/lib/geocode";
import { createMercadoPagoPreference } from "@/lib/mercadopago";
import { OrderRejectedError } from "@/lib/order-errors";
import { isValidOrderToken, orderToken } from "@/lib/order-token";
import { checkOrderRateLimit, clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { forbiddenMutationResponse, isSameOriginMutation, readBoundedJson } from "@/lib/request-security";

const tooManyOrdersMessage = "Demasiados pedidos seguidos. Probá de nuevo en un momento.";

// La distancia no se recibe: la calcula el servidor con la dirección. El tope de unidades se valida
// aparte para poder explicar el motivo, en vez del genérico "revisá los datos".
const orderSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(8).max(30),
  email: z.email(),
  fulfillment: z.enum(["retiro", "envio"]),
  paymentMethod: z.enum(["mercado_pago", "efectivo"]),
  address: z.string().trim().max(160).optional(),
  branchId: z.number().int().positive(),
  expectedTotalCents: z.number().int().min(0).optional(),
  previousOrder: z.object({
    code: z.string().trim().min(1).max(40),
    token: z.string().trim().min(1).max(128),
  }).optional(),
  items: z.array(z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().min(1),
  })).min(1).max(30).refine((items) => new Set(items.map((item) => item.variantId)).size === items.length),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return forbiddenMutationResponse();

  // Primera barrera en memoria: frena las ráfagas sin ir a la base. El límite real es el compartido, más abajo.
  const limit = rateLimit(`orders:${clientKey(request)}`, 6, 60_000);
  if (limit.limited) return tooManyRequests(limit.retryAfterSeconds, tooManyOrdersMessage);
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
  const { address, ...input } = result.data;
  if (input.items.some((item) => item.quantity > maxOnlineUnitsPerProduct)) {
    return Response.json({ error: maxOnlineUnitsMessage() }, { status: 400 });
  }
  if (input.fulfillment === "envio" && input.paymentMethod !== "mercado_pago") {
    return Response.json({ error: "Los envíos solo se pueden pagar con Mercado Pago." }, { status: 400 });
  }
  if (input.fulfillment === "envio" && !address?.trim()) {
    return Response.json({ error: "Para envío gratis necesitamos una dirección dentro de 3 km de la sucursal de Av. Independencia y Alberti." }, { status: 400 });
  }

  try {
    // Después de validar: un pedido mal armado no toca stock ni le gasta el cupo a nadie.
    const shared = await checkOrderRateLimit(clientKey(request));
    if (shared.limited) return tooManyRequests(shared.retryAfterSeconds, tooManyOrdersMessage);

    // La distancia la decide el servidor; la que mande el navegador se ignora. Sin verificar no hay envío gratis.
    let distanceKm: number | null = null;
    if (input.fulfillment === "envio") {
      const zone = await geocodeDeliveryAddress(address ?? "");
      if (!zone.ok) return Response.json({ error: zone.error }, { status: zone.status });
      if (!zone.deliveryAvailable) {
        return Response.json({ error: "Esa dirección queda fuera de los 3 km de envío gratis desde la sucursal de Av. Independencia y Alberti. Podés elegir retiro por sucursal." }, { status: 400 });
      }
      distanceKm = zone.distanceKm;
    }

    // Reintento del mismo cliente (volvió de Mercado Pago con el botón del navegador): su reserva anterior
    // le puede estar bloqueando la última unidad. Solo actúa sobre un pedido reservado y sin pagar.
    if (input.previousOrder && isValidOrderToken(input.previousOrder.code, input.previousOrder.token)) {
      await markOrderPaymentFailedByCode(input.previousOrder.code);
    }

    const order = await createOrder({
      name: input.name,
      phone: input.phone,
      email: input.email,
      fulfillment: input.fulfillment,
      paymentMethod: input.paymentMethod,
      branchId: input.branchId,
      items: input.items,
      address,
      distanceKm,
      expectedTotalCents: input.expectedTotalCents,
      source: "Tienda online",
    });
    if (input.paymentMethod === "mercado_pago") {
      try {
        const preference = await createMercadoPagoPreference({
          code: order.code,
          totalCents: order.totalCents,
          reservedUntil: "reservedUntil" in order ? order.reservedUntil : undefined,
          payer: {
            name: input.name,
            email: input.email,
            phone: input.phone,
          },
        });
        return Response.json({ ...order, ...preference, retryToken: orderToken(order.code) }, { status: 201 });
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
    // Solo los rechazos pensados para el cliente salen como vienen. El resto puede traer detalles de la base.
    if (error instanceof OrderRejectedError) {
      return Response.json({ error: error.message, reason: error.reason, variantIds: error.variantIds, prices: error.prices }, { status: 409 });
    }
    console.error("No se pudo crear el pedido", { message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "No pudimos crear el pedido. Probá de nuevo en unos minutos." }, { status: 500 });
  }
}
