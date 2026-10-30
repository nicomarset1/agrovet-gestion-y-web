import { cookies } from "next/headers";
import { AdminConsole } from "@/components/admin-console";
import { PanelIntro } from "@/components/panel-intro";
import { requireAdmin } from "@/lib/auth";
import { getAdminSnapshot, getCategories, getSubcategories, getTrashItems } from "@/lib/db";
import { PANEL_INTRO_COOKIE } from "@/lib/panel-intro";

export const dynamic = "force-dynamic";

export const metadata = { title: "Administración" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; detail?: string; order?: string; branch?: string; flash?: string }>;
}) {
  await requireAdmin();
  const [{ products, branches, orders, wholesaleClients }, categories, subcategories, trashItems, resolvedSearchParams, cookieStore] = await Promise.all([
    getAdminSnapshot(),
    getCategories(),
    getSubcategories(),
    getTrashItems(),
    searchParams,
    cookies(),
  ]);
  const playIntro = cookieStore.get(PANEL_INTRO_COOKIE)?.value === "1";
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
      {playIntro && <PanelIntro />}
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
          trashItems={trashItems}
        />
      </div>
    </div>
  );
}
