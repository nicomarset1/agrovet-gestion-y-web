import "server-only";

import { deliveryOrigin, deliveryRadiusKm, distanceKm, streetNumber } from "./delivery-zone";

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
  address?: { house_number?: string };
};

export type DeliveryGeocode =
  | { ok: true; address: string; lat: number; lon: number; distanceKm: number; deliveryAvailable: boolean }
  | { ok: false; status: 400 | 404 | 503; error: string };

const serviceDownMessage = "No pudimos verificar la dirección en este momento. Probá de nuevo en unos minutos o elegí retiro por sucursal.";

// Ubica una dirección de Mar del Plata y calcula la distancia a la sucursal. La usan /api/delivery-zone (para avisar
// antes de comprar) y /api/orders (la que decide: lo que mande el navegador no cuenta). Nunca tira excepción.
export async function geocodeDeliveryAddress(address: string): Promise<DeliveryGeocode> {
  const requestedNumber = streetNumber(address);
  if (!requestedNumber) return { ok: false, status: 400, error: "Ingresá calle y altura para verificar la zona de envío." };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("q", `${address}, Mar del Plata, Buenos Aires, Argentina`);

  let data: unknown;
  try {
    // Next solo guarda en caché las respuestas 200: una caída del servicio no queda guardada 24 h.
    const response = await fetch(url, {
      headers: { "user-agent": "agrovet-mdp-local/1.0" },
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Nominatim respondió ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data)) throw new Error("Nominatim no devolvió una lista");
  } catch (error) {
    console.error("No se pudo consultar el geocodificador", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false, status: 503, error: serviceDownMessage };
  }

  const match = (data as NominatimItem[]).find((item) => item.address?.house_number === requestedNumber);
  if (!match) return { ok: false, status: 404, error: "No pudimos confirmar esa altura exacta. Revisá calle y número o elegí retiro por sucursal." };

  const display = String(match.display_name ?? "").toLowerCase();
  if (!display.includes("mar del plata") || !display.includes("argentina")) {
    return { ok: false, status: 404, error: "La dirección encontrada no parece estar en Mar del Plata. Revisá calle y altura." };
  }

  const point = { lat: Number(match.lat), lon: Number(match.lon) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return { ok: false, status: 503, error: serviceDownMessage };
  const distance = distanceKm(deliveryOrigin, point);
  return {
    ok: true,
    address: match.display_name,
    lat: point.lat,
    lon: point.lon,
    distanceKm: Number(distance.toFixed(2)),
    deliveryAvailable: distance <= deliveryRadiusKm,
  };
}
