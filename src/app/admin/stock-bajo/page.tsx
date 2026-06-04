import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLowStockItems, getLowStockThreshold } from "@/lib/db";
import { setThresholdAction } from "./actions";

export const metadata = { title: "Stock bajo", robots: { index: false, follow: false } };

export default async function LowStockPage() {
  await requireAdmin();
  const threshold = await getLowStockThreshold();
  const items = await getLowStockItems(threshold);
  const outOfStock = items.filter((item) => item.quantity === 0).length;

  return (
    <div className="admin-shell">
      <div className="container">
        <div className="lowstock-head">
          <div>
            <h1>Stock bajo</h1>
            <p className="muted">{items.length} con stock ≤ {threshold} por sucursal · {outOfStock} sin stock</p>
          </div>
          <Link className="button button-light" href="/admin">← Volver al panel</Link>
        </div>

        <form action={setThresholdAction} className="card lowstock-threshold">
          <label htmlFor="threshold">Umbral de alerta (unidades por sucursal)</label>
          <input className="field" defaultValue={threshold} id="threshold" max={9999} min={0} name="threshold" type="number" />
          <button className="button button-primary" type="submit">Guardar</button>
        </form>

        {items.length === 0 ? (
          <p className="muted">No hay productos por debajo del umbral. 🎉</p>
        ) : (
          <ul className="lowstock-list">
            {items.map((item) => {
              const out = item.quantity === 0;
              const needed = threshold + 1 - item.quantity;
              const surplus = (item.donorQuantity ?? 0) - threshold;
              const transfer = item.donorBranchName && surplus > 0 ? Math.min(needed, surplus) : 0;
              return (
                <li className="card lowstock-item" key={`${item.variantId}-${item.branchId}`}>
                  <div className="lowstock-item-head">
                    <div>
                      <Link href={`/producto/${item.productSlug}`}><strong>{item.productName}</strong></Link>{" "}
                      <span className="muted">{item.label} · {item.sku}</span>
                    </div>
                    <span className={`lowstock-badge ${out ? "lowstock-badge-out" : "lowstock-badge-low"}`}>{out ? "Sin stock" : "Bajo"}</span>
                  </div>
                  <p className="lowstock-line">
                    <strong>{item.branchName}:</strong> {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}
                  </p>
                  {transfer >= 1 ? (
                    <p className="lowstock-suggestion">
                      Sugerencia: trasladar <strong>{transfer}</strong> desde {item.donorBranchName} (tiene {item.donorQuantity}).
                    </p>
                  ) : (
                    <p className="muted lowstock-suggestion">Ninguna sucursal tiene excedente para trasladar — reponer con proveedor.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
