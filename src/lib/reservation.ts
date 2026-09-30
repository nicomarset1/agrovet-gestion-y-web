// Reserva de stock para compras con Mercado Pago: al iniciar el pago el stock se descuenta y queda
// reservado 12 horas. Si el pago no se completa en ese plazo, la reserva vence y el stock vuelve.
export const mercadoPagoReservationHours = 12;
const reservationMs = mercadoPagoReservationHours * 60 * 60 * 1000;

// Estados de pedido de la reserva.
export const reservedStatus = "Reservado";
export const reservationExpiredStatus = "Cancelado (reserva vencida)";
export const paymentFailedStatus = "Cancelado (pago no completado)";

// Rapipago y Pago Fácil (tickets en efectivo) pueden acreditarse después de que vence la reserva.
// Nico decidió excluirlos: "si se quiere pagar en efectivo, se paga en sucursal".
export const excludeCashTickets = true;

// Fechas de la base: Postgres devuelve Date; SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC.
export function parseDbDate(value: unknown) {
  if (value instanceof Date) return value;
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return new Date(`${text.replace(" ", "T")}Z`);
  return new Date(text);
}

export function reservationExpiry(createdAt: unknown) {
  return new Date(parseDbDate(createdAt).getTime() + reservationMs);
}

// Formato que pide Mercado Pago (ISO 8601 con zona): se expresa en hora de Argentina (UTC-3, sin horario de verano).
export function mercadoPagoDate(date: Date) {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

// "23:15" si vence hoy (hora de Argentina) o "30/09 23:15" si vence otro día.
export function formatReservationTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const zone = { timeZone: "America/Argentina/Buenos_Aires" } as const;
  const day = (value: Date) => value.toLocaleDateString("es-AR", { ...zone, day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("es-AR", { ...zone, hour: "2-digit", minute: "2-digit", hour12: false });
  return day(date) === day(now) ? time : `${day(date)} ${time}`;
}
