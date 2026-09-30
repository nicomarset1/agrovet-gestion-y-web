// Impacto de restaurar un pedido desde la papelera (módulo puro, sin base): lo usan los dos drivers
// con los mismos datos que usa restoreTrashItem para reservar stock, así el panel puede avisar antes.

export type TrashImpact = {
  /** Pedidos: unidades que se vuelven a reservar al restaurar. */
  units?: number;
  /** Pedidos: sucursales de donde sale ese stock. */
  branches?: string[];
  /** Pedidos: faltantes con el stock de hoy (si hay, restaurar va a fallar). */
  shortages?: string[];
  /** Categorías y subcategorías: productos activos que vuelven a quedar adentro (o quedan sin categoría si se purga). */
  productCount?: number;
  /** Categorías: subcategorías activas que dependen de ella. */
  subcategoryCount?: number;
  /** Categorías: categorías internas activas que dependen de ella. */
  childCount?: number;
  /** Categorías internas: vuelve como principal porque su padre ya no está activo. */
  restoresAsRoot?: boolean;
  /** Productos: presentaciones que conserva. */
  variantCount?: number;
  /** Productos: unidades en stock que conserva. */
  stock?: number;
};

export type OrderImpactInput = {
  /** holdsStock false: el pedido no retiene stock (cancelado, esperando pago…): restaurarlo no reserva nada. */
  orders: Array<{ id: number; branchId: number; holdsStock?: boolean }>;
  items: Array<{ orderId: number; variantId: number; quantity: number; productName: string; variantLabel: string }>;
  allocations: Array<{ orderId: number; variantId: number; branchId: number; quantity: number }>;
  inventory: Array<{ variantId: number; branchId: number; quantity: number }>;
  branches: Array<{ id: number; name: string }>;
};

/** Misma regla que restoreTrashItem: solo reserva si el pedido retiene stock, y cada ítem sale de sus asignaciones o, si no tiene, de la sucursal del pedido. */
export function buildOrderImpacts(input: OrderImpactInput): Map<number, TrashImpact> {
  const branchName = new Map(input.branches.map((branch) => [branch.id, branch.name]));
  const stock = new Map(input.inventory.map((row) => [`${row.variantId}:${row.branchId}`, row.quantity]));
  const result = new Map<number, TrashImpact>();
  for (const order of input.orders) {
    if (order.holdsStock === false) {
      result.set(order.id, { units: 0, branches: [], shortages: [] });
      continue;
    }
    const items = input.items.filter((item) => item.orderId === order.id);
    const branches = new Set<string>();
    const shortages: string[] = [];
    let units = 0;
    for (const item of items) {
      units += item.quantity;
      const allocations = input.allocations.filter((row) => row.orderId === order.id && row.variantId === item.variantId);
      const buckets = allocations.length ? allocations : [{ branchId: order.branchId, quantity: item.quantity }];
      for (const bucket of buckets) {
        const name = branchName.get(bucket.branchId) ?? "Sucursal";
        branches.add(name);
        const available = stock.get(`${item.variantId}:${bucket.branchId}`) ?? 0;
        if (available < bucket.quantity) {
          const label = [item.productName, item.variantLabel].filter(Boolean).join(" ");
          shortages.push(`${label} en ${name}: hay ${available}, necesita ${bucket.quantity}`);
        }
      }
    }
    result.set(order.id, { units, branches: [...branches], shortages });
  }
  return result;
}
