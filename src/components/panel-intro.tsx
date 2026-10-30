"use client";

import { useEffect, useRef, useState } from "react";
import { PANEL_INTRO_COOKIE } from "@/lib/panel-intro";

export const PANEL_INTRO_END_EVENT = "agrovet:intro-end";

// Entrada al panel después de poner el código: el logo late con un anillo maíz, viaja a su lugar en el
// menú y la noche se repliega hasta quedar como el menú lateral. La primera parte es CSS (arranca con
// el primer pintado, sin esperar a React); el viaje se mide acá contra el menú real, en cualquier tamaño.
// Un toque o una tecla la saltean. Se muestra una vez: la marca del login se borra al arrancar.
export function PanelIntro() {
  const [done, setDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    document.cookie = `${PANEL_INTRO_COOKIE}=; Max-Age=0; path=${window.location.pathname}`;
    const root = rootRef.current;
    const fill = fillRef.current;
    const mark = markRef.current;
    if (!root || !fill || !mark) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let finished = false;

    const finish = (fast: boolean) => {
      if (finished) return;
      finished = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      const out = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 180 : 240, easing: "ease", fill: "forwards" });
      out.onfinish = () => {
        setDone(true);
        window.dispatchEvent(new Event(PANEL_INTRO_END_EVENT));
      };
    };

    const travel = () => {
      const brand = document.querySelector(".admin-brand-mark");
      const sidebar = document.querySelector(".admin-sidebar");
      if (!brand || !sidebar) return finish(false);
      const from = mark.getBoundingClientRect();
      const to = brand.getBoundingClientRect();
      const side = sidebar.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = to.width / from.width;
      const edge = (value: number) => `${Math.max(0, Math.round(value))}px`;
      const radius = getComputedStyle(sidebar).borderTopLeftRadius || "0px";
      const clipTo = `inset(${edge(side.top)} ${edge(window.innerWidth - side.right)} ${edge(window.innerHeight - side.bottom)} ${edge(side.left)} round ${radius})`;
      const timing = { duration: 640, easing: "cubic-bezier(.7, 0, .2, 1)", fill: "forwards" as const };
      mark.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], timing);
      fill.animate([{ clipPath: "inset(0px 0px 0px 0px round 0px)" }, { clipPath: clipTo }], timing);
      timers.push(window.setTimeout(() => finish(false), 680));
    };

    if (reduce) {
      timers.push(window.setTimeout(() => finish(false), 260));
    } else {
      // El latido dura 720 ms desde el primer pintado; si React llegó tarde, el viaje sale enseguida.
      const elapsed = Number(mark.getAnimations()[0]?.currentTime ?? 720);
      timers.push(window.setTimeout(travel, Math.max(0, 720 - elapsed)));
    }

    const skip = () => finish(true);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  if (done) return null;
  return (
    <div aria-hidden="true" className="panel-intro" ref={rootRef}>
      <div className="panel-intro-fill" ref={fillRef} />
      <span className="panel-intro-ring" />
      <span className="panel-intro-mark" ref={markRef} />
    </div>
  );
}
