"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action}>
      <input
        autoComplete="current-password"
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
      <button className="button button-primary" disabled={pending}>{pending ? "Ingresando..." : "Ingresar al panel"}</button>
    </form>
  );
}
