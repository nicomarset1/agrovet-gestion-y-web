"use client";

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "info" | "danger";
type Toast = { id: number; title: string; message?: string; type: ToastType; icon?: LucideIcon; leaving?: boolean };
type ToastContextValue = { push: (toast: Omit<Toast, "id" | "leaving">) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const toastDuration = 3200;
const toastExitDuration = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((item) => item.id === id ? { ...item, leaving: true } : item));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, toastExitDuration);
  }, []);

  const push = useCallback((toast: Omit<Toast, "id" | "leaving">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }].slice(-4));
    window.setTimeout(() => dismiss(id), toastDuration - toastExitDuration);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.icon ?? (toast.type === "danger" ? XCircle : toast.type === "success" ? CheckCircle2 : Info);
          return (
            <div className={`toast ${toast.type}${toast.leaving ? " leaving" : ""}`} key={toast.id} role="status">
              <span className="toast-icon"><Icon size={17} /></span>
              <span className="toast-body">
                <strong>{toast.title}</strong>
                {toast.message && <small>{toast.message}</small>}
              </span>
              <button aria-label="Cerrar aviso" className="toast-close" onClick={() => dismiss(toast.id)} type="button"><X size={15} /></button>
              <span className="toast-progress" aria-hidden="true" style={{ animationDuration: `${toastDuration - toastExitDuration}ms` }} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be inside ToastProvider");
  return value;
}
