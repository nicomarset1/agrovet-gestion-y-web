import { z } from "zod";
import { createOrder } from "@/lib/db";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const orderSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(8).max(30),
  email: z.email(),
  fulfillment: z.enum(["retiro", "envio"]),
  source: z.string().trim().max(120).optional(),
  address: z.string().trim().max(160).optional(),
  distanceKm: z.number().min(0).max(100).nullable().optional(),
  branchId: z.number().int().positive(),
  items: z.array(z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(30),
});

export async function POST(request: Request) {
  const limit = rateLimit(`orders:${clientKey(request)}`, 10, 60_000);
  if (limit.limited) {
    return tooManyRequests(limit.retryAfterSeconds, "Demasiados pedidos seguidos. Probá de nuevo en un momento.");
  }
  const result = orderSchema.safeParse(await request.json());
  if (!result.success) {
    return Response.json({ error: "Revisa los datos del pedido." }, { status: 400 });
  }
  try {
    const order = await createOrder(result.data);
    return Response.json(order, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo reservar stock." }, { status: 409 });
  }
}
