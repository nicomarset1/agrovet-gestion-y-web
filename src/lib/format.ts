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

// Tope de unidades por producto en una compra online. Lo valida el servidor y lo explica el carrito.
export const maxOnlineUnitsPerProduct = 20;

export function maxOnlineUnitsMessage(productName = "cada producto") {
  return `Por la tienda online se pueden comprar hasta ${maxOnlineUnitsPerProduct} unidades de ${productName}, así el stock alcanza para todos. Si necesitás más, escribinos por WhatsApp.`;
}

export function applyCashDiscount(cents: number) {
  return Math.round(cents * 0.9);
}

// Tope del precio manual de Caja: con 8 dígitos o más lo que entra al campo es un código de barras, no un precio.
export const posMaxUnitPriceCents = 999_999_900;

// Precio final por unidad de una línea de Caja, el mismo cálculo en pantalla y en el servidor.
// Un precio escrito a mano es lo que se cobra, sin 10% encima. El 10% se redondea al peso, igual que lo muestra la tienda.
export function posUnitPriceCents(listCents: number, options: { manualCents?: number | null; cashDiscount?: boolean }) {
  if (options.manualCents != null) return options.manualCents;
  return options.cashDiscount ? Math.round(applyCashDiscount(listCents) / 100) * 100 : listCents;
}

export function extrasTotalCents(extras: { amountCents: number }[]) {
  return extras.reduce((sum, extra) => sum + extra.amountCents, 0);
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
