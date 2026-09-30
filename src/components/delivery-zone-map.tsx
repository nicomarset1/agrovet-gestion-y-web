"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ZoneMapPoint } from "./delivery-zone-leaflet";

// Leaflet y su CSS viajan en un chunk aparte que se pide recién cuando el mapa entra en pantalla.
const DeliveryZoneLeaflet = dynamic(() => import("./delivery-zone-leaflet"), { ssr: false, loading: () => null });

// Si el chunk del mapa falla (sin red, bloqueado), se queda el esquema.
class MapBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

// Mapa real de la zona de envío sobre el esquema: el esquema es el placeholder (mismo alto) y el respaldo.
export function DeliveryZoneMap({ point, schematic, label }: { point: ZoneMapPoint; schematic: ReactNode; label: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "ready" | "failed">("idle");
  const onReady = useCallback(() => setStatus((current) => (current === "failed" ? current : "ready")), []);
  const onFail = useCallback(() => setStatus((current) => (current === "ready" ? current : "failed")), []);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  const showLive = visible && status !== "failed";
  return (
    <div className={`zone-map${status === "ready" ? " is-live" : ""}`} ref={wrapperRef}>
      <div className="zone-map-schematic" role="img" aria-label={label} aria-hidden={status === "ready" ? true : undefined}>
        {schematic}
      </div>
      {showLive ? (
        <div className="zone-map-live" role="region" aria-label={`${label}. Mapa de OpenStreetMap`}>
          <MapBoundary onError={onFail}>
            <DeliveryZoneLeaflet onFail={onFail} onReady={onReady} point={point} />
          </MapBoundary>
        </div>
      ) : null}
    </div>
  );
}
