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
  const pollingRef = useRef(false);
  const pollAgainRef = useRef(false);

  useEffect(() => {
    let active = true;
    const isAdmin = isPanelPath(pathname);
    const baseDelay = isAdmin ? adminDelay : publicBaseDelay;
    const maxDelay = isAdmin ? adminDelay : publicMaxDelay;
    delayRef.current = baseDelay;

    const schedule = () => {
      if (!active) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const jitter = isAdmin ? 1 : 0.8 + Math.random() * 0.4;
      timerRef.current = window.setTimeout(poll, Math.round(delayRef.current * jitter));
    };

    async function poll() {
      if (!active) return;
      if (pollingRef.current) {
        pollAgainRef.current = true;
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

      pollingRef.current = true;
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
        pollingRef.current = false;
      }

      if (pollAgainRef.current) {
        pollAgainRef.current = false;
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
      pollAgainRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener("focus", pollNow);
      window.removeEventListener("online", pollNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, router]);

  return null;
}
