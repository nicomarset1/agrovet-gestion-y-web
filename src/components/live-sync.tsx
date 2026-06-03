"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export function LiveSync({ initialVersion }: { initialVersion: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const versionRef = useRef(initialVersion);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const schedule = () => {
      if (!active) return;
      timerRef.current = window.setTimeout(poll, 5000);
    };

    async function poll() {
      if (!active) return;
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
            router.refresh();
          }
        }
      } catch {
        // Silencioso: si cae la red, reintenta en el próximo ciclo.
      }
      schedule();
    }

    const handleFocus = () => {
      void poll();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
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
