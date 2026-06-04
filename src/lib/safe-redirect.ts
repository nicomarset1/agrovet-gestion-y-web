import "server-only";

const adminFallback = "/admin";

// Rechaza caracteres de control (0x00-0x1F y 0x7F): saltos de linea / CR que
// podrian habilitar inyeccion de headers, sin escribir bytes de control en el fuente.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Sanitiza un valor de `returnTo` para evitar open redirects.
 *
 * Solo se acepta una ruta interna absoluta (empieza con un unico "/").
 * Se rechazan URLs absolutas ("https://..."), rutas protocol-relative ("//host"),
 * esquemas raros ("javascript:", "\\host") y cualquier intento de salir del sitio.
 * Si el valor no es seguro se devuelve `fallback`.
 */
export function safeInternalPath(value: string | null | undefined, fallback: string = adminFallback): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  // Debe ser una ruta relativa al sitio: un solo "/" inicial, nunca "//" ni "/\".
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  if (hasControlChars(trimmed)) return fallback;
  // Validacion final: resolver contra un origen ficticio y confirmar que sigue siendo same-origin.
  try {
    const base = "http://internal.local";
    const resolved = new URL(trimmed, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
