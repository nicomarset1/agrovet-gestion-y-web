import "server-only";

// Ruta del panel de gestión. Solo se usa del lado del servidor (redirects y revalidaciones) para que
// no aparezca en el HTML ni en el JavaScript que descarga la tienda pública.
export const panelPath = "/gestion-agrovet";
export const panelLoginPath = `${panelPath}/login`;
