// Rechazos de un pedido con mensaje pensado para el cliente. Cualquier otro error (por ejemplo, el de la base)
// nunca se le muestra: /api/orders responde un mensaje genérico y lo deja en el log.
export type OrderRejection = {
  reason: "unavailable" | "stock" | "price_changed" | "invalid";
  variantIds?: number[];
  prices?: { variantId: number; priceCents: number }[];
};

export class OrderRejectedError extends Error {
  reason: OrderRejection["reason"];
  variantIds?: number[];
  prices?: { variantId: number; priceCents: number }[];

  constructor(message: string, details: OrderRejection) {
    super(message);
    this.name = "OrderRejectedError";
    this.reason = details.reason;
    this.variantIds = details.variantIds;
    this.prices = details.prices;
  }
}

export function productDisplayName(row: { brand?: string; name?: string; label?: string } | null | undefined) {
  if (!row?.name) return "";
  return `${row.brand ? `${row.brand} ` : ""}${row.name}${row.label ? ` (${row.label})` : ""}`;
}

export function unavailableProductError(name: string, variantId: number) {
  const message = name
    ? `${name} ya no está disponible. Quitalo del carrito para seguir.`
    : "Uno de los productos del carrito ya no está disponible. Quitalo para seguir.";
  return new OrderRejectedError(message, { reason: "unavailable", variantIds: [variantId] });
}

export function outOfStockError(name: string, variantId: number, place = "en la sucursal elegida") {
  const product = name || "uno de los productos";
  return new OrderRejectedError(`No hay stock suficiente de ${product} ${place}. Bajá la cantidad o cambiá la sucursal.`, { reason: "stock", variantIds: [variantId] });
}

export function priceChangedError(prices: { variantId: number; priceCents: number }[]) {
  return new OrderRejectedError(
    "Cambió el precio de algún producto desde que armaste el carrito. Ya actualizamos los precios: revisá el total y confirmá de nuevo. No se creó ningún pedido ni se hizo ningún cobro.",
    { reason: "price_changed", prices },
  );
}
