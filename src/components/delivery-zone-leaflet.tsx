"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { deliveryOrigin, deliveryRadiusKm } from "@/lib/delivery-zone";

export type ZoneMapPoint = { lat: number; lon: number; inside: boolean } | null;

const origin: L.LatLngTuple = [deliveryOrigin.lat, deliveryOrigin.lon];

// Mapa real (OpenStreetMap) de la zona de envío. Se carga solo cuando el verificador entra en pantalla
// (ver DeliveryZoneMap). onReady/onFail avisan si las teselas cargaron, para dejar el esquema como respaldo.
export default function DeliveryZoneLeaflet({ point, onReady, onFail }: { point: ZoneMapPoint; onReady: () => void; onFail: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const addressLayerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  // Solo se monta en el navegador (next/dynamic sin SSR), así que matchMedia está disponible.
  const [touchLocked, setTouchLocked] = useState(() => window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const map = L.map(container, {
      center: origin,
      zoom: 13,
      scrollWheelZoom: false, // la rueda sigue moviendo la página
      dragging: !coarsePointer, // en celular: se mueve recién después de un toque, así el scroll no queda atrapado
      keyboard: false, // el mapa es complemento: el foco no se queda en él
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    container.removeAttribute("tabindex");

    let loadedTiles = 0;
    let failedTiles = 0;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    });
    tiles.on("tileload", () => { loadedTiles++; if (loadedTiles === 1) onReady(); });
    tiles.on("tileerror", () => { failedTiles++; if (!loadedTiles && failedTiles >= 4) onFail(); });
    tiles.addTo(map);
    // Si en 8 s no llegó ninguna tesela (sin red o bloqueado), queda el esquema.
    const timeout = window.setTimeout(() => { if (!loadedTiles) onFail(); }, 8000);

    circleRef.current = L.circle(origin, {
      radius: deliveryRadiusKm * 1000,
      color: "#7c3aed",
      weight: 2,
      fillColor: "#7c3aed",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map);
    map.fitBounds(circleRef.current.getBounds(), { padding: [12, 12] });

    L.marker(origin, {
      icon: L.divIcon({
        className: "zone-live-store",
        html: '<span class="zone-live-store-mark"><img alt="" src="/brand/agrovet-mark-144.webp" width="26" height="26"></span>',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
      interactive: false, // un toque sobre el marcador tiene que llegar al mapa (habilita el arrastre)
      keyboard: false,
      title: "Sucursal Av. Independencia y Alberti",
      alt: "Sucursal Av. Independencia y Alberti",
    }).addTo(map);

    // Un toque (un dedo, casi sin moverse y corto) habilita mover el mapa con un dedo; deslizar sigue moviendo la página.
    let touchStart: { x: number; y: number; time: number } | null = null;
    const unlock = () => {
      if (map.dragging.enabled()) return;
      map.dragging.enable();
      setTouchLocked(false);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touchStart && touch && Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) < 10 && Date.now() - touchStart.time < 500) unlock();
      touchStart = null;
    };
    if (coarsePointer) {
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchend", onTouchEnd, { passive: true });
      container.addEventListener("click", unlock);
    }

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("click", unlock);
      window.clearTimeout(timeout);
      map.remove();
      mapRef.current = null;
    };
  }, [onFail, onReady]);

  // Marcador de la dirección verificada y encuadre de sucursal + dirección.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    addressLayerRef.current?.remove();
    addressLayerRef.current = null;
    if (!point) {
      if (circleRef.current) map.fitBounds(circleRef.current.getBounds(), { padding: [12, 12] });
      return;
    }
    const target: L.LatLngTuple = [point.lat, point.lon];
    addressLayerRef.current = L.marker(target, {
      icon: L.divIcon({
        className: `zone-live-address ${point.inside ? "inside" : "outside"}`,
        html: "<span></span>",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      interactive: false, // un toque sobre el marcador tiene que llegar al mapa (habilita el arrastre)
      keyboard: false,
      title: point.inside ? "Tu dirección: dentro de la zona" : "Tu dirección: fuera de la zona",
    }).addTo(map);
    // Encuadra sucursal y dirección, con aire para que los dos marcadores no se tapen.
    map.fitBounds(L.latLngBounds([origin, target]), { padding: [48, 48], maxZoom: 15 });
  }, [point]);

  return (
    <div className="zone-live">
      <div className="zone-live-map" ref={containerRef} />
      {touchLocked ? <span className="zone-live-hint" aria-hidden="true">Tocá el mapa para moverlo</span> : null}
    </div>
  );
}
