// Zona de envío gratis: centro en la sucursal de Av. Independencia y Alberti.
// Coordenadas de la esquina en OpenStreetMap (nodo 3213358190). Las usan /api/delivery-zone y el mapa.
export const deliveryOrigin = { lat: -38.0036237, lon: -57.5588354 };
export const deliveryRadiusKm = 3;

type Point = { lat: number; lon: number };

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
