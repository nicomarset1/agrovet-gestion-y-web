"use client";

import { CircleAlert, MapPin, MapPinCheck, MapPinX, Search } from "lucide-react";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";

type Zone = { distanceKm: number; deliveryAvailable: boolean; lat?: number; lon?: number; error?: string };

const origin = { lat: -38.0033, lon: -57.5596 };

function toBearingDegrees(lat: number, lon: number) {
  const startLat = origin.lat * Math.PI / 180;
  const endLat = lat * Math.PI / 180;
  const dLon = (lon - origin.lon) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// headingLevel: 2 cuando el verificador es una sección principal de la página (/envios); 3 dentro de otra sección (home).
export function DeliveryZoneChecker({ variant = "default", headingLevel = 3 }: { variant?: "default" | "compact"; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState<Zone | null>(null);
  const [pending, setPending] = useState(false);
  const markerStyle = useMemo<CSSProperties | undefined>(() => {
    if (!zone || zone.error || typeof zone.lat !== "number" || typeof zone.lon !== "number") return undefined;
    const bearing = toBearingDegrees(zone.lat, zone.lon);
    const radians = bearing * Math.PI / 180;
    const distanceRatio = clamp(zone.distanceKm / 3, 0, 1);
    const overflowRatio = clamp((zone.distanceKm - 3) / 6, 0, 1);
    const radiusPct = zone.deliveryAvailable
      ? 12 + distanceRatio * 9
      : 34 + overflowRatio * 18;
    const x = clamp(50 + Math.sin(radians) * radiusPct, 10, 90);
    const y = clamp(50 - Math.cos(radians) * radiusPct, 10, 90);
    return {
      ["--zone-x" as string]: `${x}%`,
      ["--zone-y" as string]: `${y}%`,
    };
  }, [zone]);

  async function checkZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (address.trim().length < 5) {
      setZone({ distanceKm: 0, deliveryAvailable: false, error: "Ingresá una dirección válida." });
      return;
    }
    if (!/\b\d{2,6}\b/.test(address)) {
      setZone({ distanceKm: 0, deliveryAvailable: false, error: "Ingresá calle y altura para verificar correctamente." });
      return;
    }
    setPending(true);
    setZone(null);
    const response = await fetch("/api/delivery-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const result = await response.json() as { distanceKm?: number; deliveryAvailable?: boolean; lat?: number; lon?: number; error?: string };
    setPending(false);
    if (!response.ok) {
      setZone({ distanceKm: 0, deliveryAvailable: false, error: result.error ?? "No pudimos ubicar esa dirección." });
      return;
    }
    setZone({
      distanceKm: result.distanceKm ?? 0,
      deliveryAvailable: Boolean(result.deliveryAvailable),
      lat: result.lat,
      lon: result.lon,
    });
  }

  return (
    <div className={`delivery-zone-card card${variant === "compact" ? " compact" : ""}`}>
      {variant === "default" ? <div className="zone-map" aria-label="Zona de envío gratis" role="img">
        <span className="zone-circle" />
        <span className="zone-store"><MapPin size={18} /></span>
        {zone && !zone.error && <span className={`zone-address ${zone.deliveryAvailable ? "inside" : "outside"}`} key={`${zone.lat}-${zone.lon}`} style={markerStyle} />}
      </div> : null}
      <div className="zone-content">
        <p className="eyebrow">Zona de envío</p>
        <Heading className="zone-title">Consultá si llegamos a tu dirección</Heading>
        <p>Envíos gratis de lunes a sábados según zona, dentro de 3 km de Alberti 3213 y con compra mínima de $ 50.000.</p>
        <form className="zone-form" onSubmit={checkZone}>
          <input aria-label="Tu dirección en Mar del Plata" autoComplete="street-address" className="field" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Tu dirección en Mar del Plata" />
          <button aria-busy={pending} className="mini-button" disabled={pending}>{pending ? <span className="loader-dot" aria-hidden="true" /> : <Search size={15} />} {pending ? "Buscando" : "Verificar"}</button>
        </form>
        {zone?.error && <p className="notice error zone-result" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{zone.error}</span></p>}
        {zone && !zone.error && (
          <p className={`notice zone-result ${zone.deliveryAvailable ? "is-inside" : "error"}`} role="status">
            {zone.deliveryAvailable ? <MapPinCheck size={17} aria-hidden="true" /> : <MapPinX size={17} aria-hidden="true" />}
            <span>{zone.deliveryAvailable ? "Tu dirección está dentro de la zona de envío gratis." : "Tu dirección queda fuera de la zona de envío gratis."} Distancia estimada: {zone.distanceKm} km.</span>
          </p>
        )}
      </div>
    </div>
  );
}
