// Helpers de fecha puros para DatePicker y DateRangePicker (portados de proyecto-conmebol).
// Todo en horario local (no UTC) a propósito: son fechas de calendario sin hora, no timestamps.

export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const WEEKDAYS_SHORT = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "29 sep 2026" */
export function formatShortDate(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseIsoDate(value);
  if (!date) return "";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 sep – 29 sep 2026", "28 dic 2025 – 3 ene 2026" o "29 sep 2026" si es un solo día. */
export function formatRange(from: string, to: string): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start && !end) return "";
  if (start && !end) return `${formatShortDate(start)} – …`;
  if (!start || !end) return formatShortDate(end ?? start);
  if (from === to) return formatShortDate(start);
  const startLabel = start.getFullYear() === end.getFullYear()
    ? `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`
    : formatShortDate(start);
  return `${startLabel} – ${formatShortDate(end)}`;
}

/** "martes 29 de septiembre de 2026", para lectores de pantalla. */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]} de ${date.getFullYear()}`;
}

export function monthTitle(date: Date): string {
  const name = MONTHS_LONG[date.getMonth()];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.getFullYear()}`;
}

/**
 * Grilla de 6 semanas (42 días) para un mes, empezando en lunes. Incluye días del mes
 * anterior y siguiente para completar la primera y la última semana (inMonth: false).
 */
export function getCalendarGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, inMonth: date.getMonth() === month };
  });
}
