"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 820px)";
// Por debajo de este scroll el header siempre está completo.
const TOP_ZONE = 160;
// Distancia mínima en una misma dirección antes de cambiar de estado, para que no titile.
const THRESHOLD = 28;

/** En celular oculta la fila Tienda/Locales/Carrito al bajar y la muestra al subir. */
export function HeaderCompact() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia(MOBILE_QUERY);
    let lastY = window.scrollY;
    let anchorY = lastY;
    let direction = 0;
    let frame = 0;
    let wasLocked = false;

    const setCompact = (compact: boolean) => {
      if (compact) root.dataset.headerCompact = "";
      else delete root.dataset.headerCompact;
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      // El bloqueo de scroll del menú mueve el body con position: fixed; no cuenta como scroll real.
      const locked = document.body.style.position === "fixed";
      if (!media.matches || locked || wasLocked) {
        // Al cerrar el menú se restaura el scroll de golpe: se toma como nuevo punto de partida.
        wasLocked = locked;
        lastY = y;
        anchorY = y;
        return;
      }
      if (y <= TOP_ZONE) {
        setCompact(false);
      } else {
        const nextDirection = Math.sign(y - lastY);
        if (nextDirection !== 0 && nextDirection !== direction) {
          direction = nextDirection;
          anchorY = lastY;
        }
        if (direction > 0 && y - anchorY > THRESHOLD) setCompact(true);
        if (direction < 0 && anchorY - y > THRESHOLD) setCompact(false);
      }
      lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onMediaChange = () => {
      if (!media.matches) setCompact(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    media.addEventListener("change", onMediaChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      media.removeEventListener("change", onMediaChange);
      if (frame) window.cancelAnimationFrame(frame);
      setCompact(false);
    };
  }, []);

  return null;
}
