import { AdminConsole } from "@/components/admin-console";
import { requireAdmin } from "@/lib/auth";
import { getAdminSnapshot, getCategories, getSubcategories } from "@/lib/db";

export const metadata = { title: "Administración" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; detail?: string; order?: string; branch?: string; flash?: string }>;
}) {
  await requireAdmin();
  const { products, branches, orders, wholesaleClients } = getAdminSnapshot();
  const categories = getCategories();
  const subcategories = getSubcategories();
  const resolvedSearchParams = await searchParams;
  const section = resolvedSearchParams.section ?? "resumen";
  const detail = resolvedSearchParams.detail ?? null;
  const order = resolvedSearchParams.order ?? null;
  const branch = resolvedSearchParams.branch ?? null;
  const flash = resolvedSearchParams.flash ?? null;
  const parsedOrderId = order ? Number(order) : null;
  const initialOrderId = parsedOrderId !== null && Number.isFinite(parsedOrderId) ? parsedOrderId : null;
  const parsedBranchId = branch ? Number(branch) : null;
  const initialBranchId = parsedBranchId !== null && Number.isFinite(parsedBranchId) ? parsedBranchId : null;
  return (
    <div className="admin-shell">
      <div className="container">
        <AdminConsole
          key={`${section}:${detail}:${order}:${branch}`}
          branches={branches}
          categories={categories}
          orders={orders}
          products={products}
          wholesaleClients={wholesaleClients}
          initialDetail={detail}
          initialBranchId={initialBranchId}
          initialOrderId={initialOrderId}
          initialNotice={flash}
          initialSection={section}
          subcategories={subcategories}
        />
      </div>
    </div>
  );
}
