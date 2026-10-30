"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const PANEL_INTRO_END_EVENT = "agrovet:intro-end";

// Pedido de animación a nivel de módulo: quien la pide puede montarse antes que el host del layout.
let introRequested = false;
const introListeners = new Set<() => void>();

// La llama el login apenas el código es válido, antes de navegar al panel.
export function startPanelIntro() {
  if (introRequested) return;
  introRequested = true;
  introListeners.forEach((listener) => listener());
}

// Login con la sesión ya iniciada (justo después de poner el código, o si se entra a /login estando
// adentro): arranca la animación antes del primer pintado y recién después navega al panel.
export function PanelIntroLauncher({ to }: { to: string }) {
  const router = useRouter();
  useLayoutEffect(() => {
    startPanelIntro();
    router.replace(to);
  }, [router, to]);
  return null;
}

// Lo que se ve es el panel real, no el esqueleto de carga (loading.tsx también tiene .admin-brand-mark).
const realBrandMark = ".admin-shell:not(.admin-skeleton) .admin-sidebar .admin-brand-mark";
const realSidebar = ".admin-shell:not(.admin-skeleton) .admin-sidebar";

// Entrada al panel: vive en el layout de /gestion-agrovet, así sigue montada mientras se pasa del login
// al panel y tapa la carga. El logo late con un anillo maíz y, cuando el panel ya está, viaja a su lugar
// en el menú mientras la noche se repliega hasta quedar como el menú lateral. Medido contra el menú real,
// sirve en cualquier tamaño. Un toque o una tecla la acortan (recién cuando el panel ya cargó).
export function PanelIntroHost() {
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sync = () => { if (introRequested) setPlaying(true); };
    introListeners.add(sync);
    sync();
    return () => { introListeners.delete(sync); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const root = rootRef.current;
    const fill = fillRef.current;
    const mark = markRef.current;
    if (!root || !fill || !mark) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    const minimum = reduce ? 200 : 900;
    let frame = 0;
    let timer = 0;
    let finished = false;
    let skipRequested = false;

    const finish = (fast: boolean) => {
      if (finished) return;
      finished = true;
      const out = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 180 : 240, easing: "ease", fill: "forwards" });
      out.onfinish = () => {
        introRequested = false;
        setPlaying(false);
        window.dispatchEvent(new Event(PANEL_INTRO_END_EVENT));
      };
    };

    const travel = () => {
      const brand = document.querySelector(realBrandMark);
      const sidebar = document.querySelector(realSidebar);
      if (!brand || !sidebar || reduce || skipRequested) return finish(skipRequested);
      root.classList.remove("is-waiting");
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
      timer = window.setTimeout(() => finish(false), 680);
    };

    // Espera a que el panel real esté montado y a que el latido haya tenido su tiempo. Si la carga
    // tarda, el anillo sigue latiendo; si nunca llega (error), a los 15 s la noche se va igual.
    const waitForPanel = () => {
      const elapsed = performance.now() - startedAt;
      if (document.querySelector(realBrandMark) && elapsed >= minimum) {
        // Dos cuadros más para que el menú termine de ubicarse (contraído o no) antes de medirlo.
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(travel); });
        return;
      }
      if (elapsed > 15000) return finish(false);
      if (elapsed > minimum) root.classList.add("is-waiting");
      frame = requestAnimationFrame(waitForPanel);
    };
    frame = requestAnimationFrame(waitForPanel);

    const skip = () => {
      skipRequested = true;
      if (document.querySelector(realBrandMark)) {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        finish(true);
      }
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [playing]);

  if (!playing) return null;
  return (
    <div aria-hidden="true" className="panel-intro" ref={rootRef}>
      <div className="panel-intro-fill" ref={fillRef} />
      <span className="panel-intro-ring" />
      <span className="panel-intro-mark" ref={markRef} />
    </div>
  );
}
