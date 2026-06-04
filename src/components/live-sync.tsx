"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const baseDelay = 5000;
const maxDelay = 60000;

export function LiveSync({ initialVersion }: { initialVersion: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const versionRef = useRef(initialVersion);
  const timerRef = useRef<number | null>(null);
  const delayRef = useRef(baseDelay);

  useEffect(() => {
    let active = true;

    const schedule = () => {
      if (!active) return;
      // Jitter ±20% para que los clientes no consulten todos en sincronía.
      const jitter = 0.8 + Math.random() * 0.4;
      timerRef.current = window.setTimeout(poll, Math.round(delayRef.current * jitter));
    };

    async function poll() {
      if (!active) return;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      try {
        const response = await fetch("/api/sync-version", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json() as { version?: number };
          if (typeof data.version === "number" && data.version !== versionRef.current) {
            versionRef.current = data.version;
            delayRef.current = baseDelay; // Hubo cambios: volver a consultar seguido.
            router.refresh();
          } else {
            // Sin cambios: backoff exponencial hasta el máximo.
            delayRef.current = Math.min(maxDelay, Math.round(delayRef.current * 1.6));
          }
        }
      } catch {
        // Silencioso: si cae la red, reintenta en el próximo ciclo.
      }
      schedule();
    }

    const pollNow = () => {
      // Interacción del usuario: resetear el backoff y consultar ya.
      delayRef.current = baseDelay;
      void poll();
    };

    const handleFocus = () => pollNow();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") pollNow();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    schedule();

    return () => {
      active = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, router]);

  return null;
}
