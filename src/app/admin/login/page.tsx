import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isAdmin } from "@/lib/auth";

export const metadata = { title: "Ingreso administrativo" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="admin-shell">
      <section className="card login">
        <p className="eyebrow">Acceso privado</p>
        <h1 className="display">Panel Agrovet</h1>
        <p className="description">Gestión de catálogo, stock por sucursal, pedidos y canales de venta.</p>
        <LoginForm />
        {process.env.NODE_ENV !== "production" && <p className="notice" style={{ marginTop: 18 }}>Usá el código configurado en <strong>.env.local</strong>.</p>}
      </section>
    </div>
  );
}
