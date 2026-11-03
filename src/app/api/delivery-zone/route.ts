import { z } from "zod";
import { geocodeDeliveryAddress } from "@/lib/geocode";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { forbiddenMutationResponse, isSameOriginMutation, readBoundedJson } from "@/lib/request-security";

const schema = z.object({
  address: z.string().trim().min(5).max(160),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return forbiddenMutationResponse();

  // Protege el proxy a Nominatim (su politica de uso prohibe trafico abusivo).
  const limit = rateLimit(`delivery-zone:${clientKey(request)}`, 15, 60_000);
  if (limit.limited) {
    return tooManyRequests(limit.retryAfterSeconds, "Demasiadas consultas de zona. Esperá un momento e intentá de nuevo.");
  }
  let body: unknown;
  try {
    body = await readBoundedJson(request, 2_000);
  } catch {
    return Response.json({ error: "Direccion invalida." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Direccion invalida." }, { status: 400 });
  }

  const result = await geocodeDeliveryAddress(parsed.data.address);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({
    address: result.address,
    lat: result.lat,
    lon: result.lon,
    distanceKm: result.distanceKm,
    deliveryAvailable: result.deliveryAvailable,
  });
}
