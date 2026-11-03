// Zona de envío gratis: centro en la sucursal de Av. Independencia y Alberti.
// Coordenadas de la esquina en OpenStreetMap (nodo 3213358190). Las usan /api/delivery-zone y el mapa.
export const deliveryOrigin = { lat: -38.0036237, lon: -57.5588354 };
export const deliveryRadiusKm = 3;

type Point = { lat: number; lon: number };

// Altura de una dirección: el último número de la calle. "14 de Julio 1500" es 1500, no 14.
// Un número seguido de "de ..." es parte del nombre: "25 de Mayo" a secas no tiene altura.
// Lo que viene después de la altura (piso, depto, entre calles) no cuenta. Las palabras se buscan solo después
// de un número porque también pueden ser parte del nombre: Entre Ríos es una calle de Mar del Plata.
const afterHeight = /\b(?:piso|depto|dpto|dto|departamento|apto|pb|entre|esq|esquina|timbre|local|oficina)\b/i;

export function streetNumber(address: string) {
  const street = address.split(",")[0];
  const numbers = [...street.matchAll(/\b\d{2,6}\b(?!\s+de\s)/gi)];
  let height = numbers[0];
  for (const number of numbers.slice(1)) {
    if (afterHeight.test(street.slice(height.index + height[0].length, number.index))) break;
    height = number;
  }
  return height?.[0] ?? "";
}

// Distancia en km entre dos puntos (fórmula de haversine).
export function distanceKm(a: Point, b: Point) {
  const radius = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radius * Math.asin(Math.sqrt(h));
}
