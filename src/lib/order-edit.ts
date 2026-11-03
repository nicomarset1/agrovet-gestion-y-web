// Reglas de editar un pedido ya creado (módulo puro, sin base): las usan los dos drivers.

type Allocation = { branchId: number; quantity: number };

// Lleva el reparto por sucursal a la cantidad nueva. Lo que se agrega sale de la sucursal con más unidades
// del pedido; lo que se quita, de la que tiene menos.
export function resizeAllocations(current: Allocation[], quantity: number, fallbackBranchId: number): Allocation[] {
  const ranked = current
    .map(({ branchId, quantity: allocated }) => ({ branchId, quantity: allocated }))
    .sort((a, b) => b.quantity - a.quantity || a.branchId - b.branchId);
  if (!ranked.length) return [{ branchId: fallbackBranchId, quantity }];
  const allocated = ranked.reduce((sum, allocation) => sum + allocation.quantity, 0);
  if (quantity >= allocated) {
    ranked[0].quantity += quantity - allocated;
    return ranked;
  }
  let toRemove = allocated - quantity;
  for (let index = ranked.length - 1; index >= 0 && toRemove > 0; index--) {
    const removed = Math.min(ranked[index].quantity, toRemove);
    ranked[index].quantity -= removed;
    toRemove -= removed;
  }
  return ranked.filter((allocation) => allocation.quantity > 0);
}

// Lo cobrado después de cambiar el total. Una venta de Caja ya se cobró entera, sea cual sea el total nuevo.
// Un mayorista conserva lo que pagó (sin pasarse del total) y su estado sigue a la deuda.
export function settleEditedOrder(order: { source: string; status: string; paidCents: number; totalCents: number }) {
  if (/^Caja\b/i.test(order.source)) return { paidCents: order.totalCents, status: order.status };
  if (/^Mayorista\b/i.test(order.source) && /^(Cerrado mayorista|Cuenta corriente)$/i.test(order.status.trim())) {
    const paidCents = Math.min(order.paidCents, order.totalCents);
    return { paidCents, status: paidCents >= order.totalCents ? "Cerrado mayorista" : "Cuenta corriente" };
  }
  return { paidCents: order.paidCents, status: order.status };
}
