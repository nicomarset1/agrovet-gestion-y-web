import { LoginForm } from "@/components/login-form";
import { PanelIntroLauncher } from "@/components/panel-intro";
import { PawTrail } from "@/components/paw-trail";
import { isAdmin } from "@/lib/auth";
import { panelPath } from "@/lib/panel-path";

export const metadata = { title: "Ingreso administrativo" };

export default async function LoginPage() {
  // Con la sesión ya iniciada no se redirige desde el servidor: la animación de entrada tiene que
  // arrancar antes de que se vea la carga del panel.
  if (await isAdmin()) {
    return (
      <div className="admin-shell admin-login-shell">
        <PawTrail />
        {/* La misma tarjeta, ya ingresando: la noche de la animación se funde sobre ella sin saltos. */}
        <section className="card login">
          <p className="eyebrow">Acceso privado</p>
          <h1 className="display">Panel Agrovet</h1>
          <p className="description">Gestión de catálogo, stock por sucursal, pedidos y canales de venta.</p>
          <input aria-label="Código de acceso" className="field" defaultValue="00000000" disabled type="password" />
          <button className="button button-primary" disabled type="button">Ingresando...</button>
        </section>
        <PanelIntroLauncher to={panelPath} />
      </div>
    );
  }
  return (
    <div className="admin-shell admin-login-shell">
      <PawTrail />
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
