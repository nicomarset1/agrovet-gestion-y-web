import type { Metadata } from "next";

// El panel no se indexa. El layout raíz ya no le muestra header ni footer de la tienda (StoreChrome).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Si el panel ya se abrió en esta pestaña, una recarga no repite la cascada de entrada: se agrega,
// antes de pintar, un estilo que la cambia por un fundido corto. Es un <style> en <head> y no toca
// atributos que React hidrata.
const panelEntryScript = `try{if(sessionStorage.getItem("agrovet-panel-entered")&&!document.getElementById("panel-entered-motion")){var s=document.createElement("style");s.id="panel-entered-motion";s.textContent=".admin-shell .admin-enter *{animation-delay:0s!important}.admin-shell .admin-enter .admin-main{animation:ui-fade-in .16s ease both}.admin-shell .admin-enter .admin-main *{animation-name:none!important}";document.head.appendChild(s)}}catch(e){}`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: panelEntryScript }} />
      {children}
    </>
  );
}
