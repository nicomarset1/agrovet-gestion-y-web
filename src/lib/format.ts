export function formatPrice(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Compra mínima para envío a domicilio. Lo valida el servidor al crear el pedido y lo muestra la tienda.
export const deliveryMinimumCents = 5000000;

export function deliveryMinimumMessage() {
  return `El envío requiere una compra mínima de ${formatPrice(deliveryMinimumCents)}. Para este pedido elegí retiro por sucursal.`;
}

export function applyCashDiscount(cents: number) {
  return Math.round(cents * 0.9);
}

export function initials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");
}
