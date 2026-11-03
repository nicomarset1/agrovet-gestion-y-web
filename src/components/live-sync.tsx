"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPanelPath } from "@/lib/panel-route";

const adminDelay = 2000;
const publicBaseDelay = 8000;
const publicMaxDelay = 30000;

export function LiveSync({ initialVersion }: { initialVersion: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const versionRef = useRef(initialVersion);
  const timerRef = useRef<number | null>(null);
  const delayRef = useRef(isPanelPath(pathname) ? adminDelay : publicBaseDelay);

  useEffect(() => {
    let active = true;
    // Propios de cada efecto: compartidos entre efectos, una consulta en vuelo al cambiar de ruta (o en el doble
    // efecto de desarrollo) dejaba la siguiente en manos del efecto viejo, que ya no hacía nada, y el panel
    // no se volvía a enterar de los cambios hasta recuperar el foco.
    let polling = false;
    let pollAgain = false;
    const isAdmin = isPanelPath(pathname);
    const baseDelay = isAdmin ? adminDelay : publicBaseDelay;
    const maxDelay = isAdmin ? adminDelay : publicMaxDelay;
    delayRef.current = baseDelay;

    // En la tienda no hay consulta periódica: solo al cargar y al volver a la pestaña (focus, visible,
    // online). Así cada visitante no suma consultas cada pocos segundos; el panel sí consulta cada 2 s.
    const schedule = () => {
      if (!active || !isAdmin) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const jitter = isAdmin ? 1 : 0.8 + Math.random() * 0.4;
      timerRef.current = window.setTimeout(poll, Math.round(delayRef.current * jitter));
    };

    async function poll() {
      if (!active) return;
      if (polling) {
        pollAgain = true;
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }

      polling = true;
      try {
        const response = await fetch("/api/sync-version", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json() as { version?: number };
          if (typeof data.version === "number" && data.version !== versionRef.current) {
            versionRef.current = data.version;
            delayRef.current = baseDelay;
            router.refresh();
          } else {
            delayRef.current = isAdmin
              ? adminDelay
              : Math.min(maxDelay, Math.round(delayRef.current * 1.35));
          }
        }
      } catch {
        delayRef.current = baseDelay;
      } finally {
        polling = false;
      }

      if (pollAgain) {
        pollAgain = false;
        void poll();
        return;
      }
      schedule();
    }

    const pollNow = () => {
      delayRef.current = baseDelay;
      void poll();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") pollNow();
    };

    window.addEventListener("focus", pollNow);
    window.addEventListener("online", pollNow);
    document.addEventListener("visibilitychange", handleVisibility);
    // Detecta cambios ocurridos entre el render del servidor y la hidratación.
    void poll();

    return () => {
      active = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener("focus", pollNow);
      window.removeEventListener("online", pollNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, router]);

  return null;
}
