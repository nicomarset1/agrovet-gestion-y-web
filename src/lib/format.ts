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

// Cuotas en singular o plural: "1 cuota", "3 cuotas". Es lo que se guarda desde ahora en ventas nuevas.
export function installmentsLabel(installments: string | number) {
  return String(installments) === "1" ? "1 cuota" : `${installments} cuotas`;
}

// Las ventas viejas quedaron guardadas como "(1 cuotas)": se corrige solo al mostrarlas.
export function fixInstallmentsText(value: string) {
  return value.replace(/\(1 cuotas\)/gi, "(1 cuota)");
}

export function initials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");
}
