"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, type LoginState } from "@/app/gestion-agrovet/actions";
import { startPanelIntro } from "@/components/panel-intro";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const router = useRouter();
  // Código válido: primero la animación de entrada (tapa todo) y después la navegación al panel.
  useEffect(() => {
    if (!state.to) return;
    startPanelIntro();
    router.replace(state.to);
  }, [router, state]);
  return (
    <form action={action}>
      <input
        aria-label="Código de acceso"
        autoComplete="current-password"
        autoFocus
        className="field"
        inputMode="numeric"
        maxLength={12}
        minLength={8}
        name="password"
        pattern="[0-9]{8,12}"
        placeholder="Código numérico"
        required
        type="password"
      />
      {state.error && <p className="notice error">{state.error}</p>}
      <button className="button button-primary" disabled={pending || Boolean(state.to)}>{pending || state.to ? "Ingresando..." : "Ingresar al panel"}</button>
    </form>
  );
}
