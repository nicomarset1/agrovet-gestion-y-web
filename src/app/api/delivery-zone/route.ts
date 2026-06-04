import { z } from "zod";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const origin = { lat: -38.0033, lon: -57.5596 };

const schema = z.object({
  address: z.string().trim().min(5).max(160),
});

function streetNumber(address: string) {
  return /\b\d{2,6}\b/.exec(address)?.[0] ?? "";
}

function distanceKm(a: typeof origin, b: typeof origin) {
  const radius = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export async function POST(request: Request) {
  // Protege el proxy a Nominatim (su politica de uso prohibe trafico abusivo).
  const limit = rateLimit(`delivery-zone:${clientKey(request)}`, 15, 60_000);
  if (limit.limited) {
    return tooManyRequests(limit.retryAfterSeconds, "Demasiadas consultas de zona. Esperá un momento e intentá de nuevo.");
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Direccion invalida." }, { status: 400 });
  }

  const requestedNumber = streetNumber(parsed.data.address);
  if (!requestedNumber) {
    return Response.json({ error: "Ingresa calle y altura para verificar correctamente la zona de envio." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("q", `${parsed.data.address}, Mar del Plata, Buenos Aires, Argentina`);

  const response = await fetch(url, {
    headers: { "user-agent": "agrovet-mdp-local/1.0" },
    next: { revalidate: 60 * 60 * 24 },
  });
  const data = await response.json() as {
    lat: string;
    lon: string;
    display_name: string;
    address?: {
      house_number?: string;
      city?: string;
      town?: string;
      village?: string;
      country?: string;
    };
  }[];

  const match = data.find((item) => item.address?.house_number === requestedNumber);
  if (!match) {
    return Response.json({ error: "No pudimos confirmar esa altura exacta. Revisa calle y numero o elegi retiro por sucursal." }, { status: 404 });
  }

  const display = match.display_name.toLowerCase();
  if (!display.includes("mar del plata") || !display.includes("argentina")) {
    return Response.json({ error: "La direccion encontrada no parece estar en Mar del Plata. Revisa calle y altura." }, { status: 404 });
  }

  const distance = distanceKm(origin, { lat: Number(match.lat), lon: Number(match.lon) });
  return Response.json({
    address: match.display_name,
    lat: Number(match.lat),
    lon: Number(match.lon),
    distanceKm: Number(distance.toFixed(2)),
    deliveryAvailable: distance <= 3,
  });
}
