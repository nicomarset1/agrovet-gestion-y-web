// Los días del negocio se cortan en hora de Argentina, sin importar dónde corra el código: el servidor
// está en UTC y el navegador puede tener otra zona. Si cada uno usa la suya, la misma venta cae en días
// distintos en el panel y en el PDF.

export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

// created_at viene en UTC. SQLite lo guarda sin zona ("2026-11-01 02:30:00"): sin agregarle la Z,
// new Date() lo leería como hora local.
export function parseOrderDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) return new Date(normalized);
  return new Date(`${normalized}Z`);
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ARGENTINA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

// Día en Argentina como "2026-10-31". Una fecha rota se devuelve como vino, para no tirar abajo un listado.
export function argentinaDayKey(value: Date | string) {
  const date = typeof value === "string" ? parseOrderDate(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return dayFormat.format(date);
}

// Argentina no tiene horario de verano desde 2009: el corrimiento fijo alcanza y no depende de la zona del navegador.
export function argentinaMidnight(dayKey: string) {
  return new Date(`${dayKey}T00:00:00-03:00`);
}

function keyFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysToKey(dayKey: string, days: number) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromUtc(date);
}

// Pensada para el primer día del mes: un 31 + 1 mes pasaría al mes siguiente.
export function addMonthsToKey(dayKey: string, months: number) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return keyFromUtc(date);
}

export function formatArgentinaDateTime(value: string | Date, options: Intl.DateTimeFormatOptions) {
  const date = typeof value === "string" ? parseOrderDate(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("es-AR", { timeZone: ARGENTINA_TIME_ZONE, ...options }).format(date).replace(/[  ]/g, " ");
}
