import "server-only";

import { hitRateLimit } from "./db";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const maxBuckets = 10000;

export type RateLimitResult = { limited: boolean; retryAfterSeconds: number; remaining: number };

function prune(now: number) {
  if (buckets.size < maxBuckets) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Rate-limit de ventana fija en memoria del proceso.
 *
 * NOTA: en entornos serverless (Vercel) el estado es por instancia y se reinicia
 * en cold starts, por lo que actua como una primera barrera contra rafagas/abuso,
 * no como un limite global exacto. Para limites estrictos usar Redis/Upstash.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0, remaining: limit - 1 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), remaining: 0 };
  }
  return { limited: false, retryAfterSeconds: 0, remaining: limit - bucket.count };
}

/**
 * Deriva una clave de cliente confiable desde los headers del request.
 * Prioriza x-real-ip (lo setea el proxy de confianza); de x-forwarded-for usa
 * el valor mas a la derecha, evitando el primer valor que controla el cliente.
 */
export function clientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const trusted = parts[parts.length - 1];
    if (trusted) return trusted;
  }
  return "local";
}

// A quién se le cuenta el límite compartido. Una conexión IPv6 suele tener una red /64 entera para ella:
// contar por dirección dejaría esquivar el límite cambiando de dirección en cada pedido.
export function rateLimitSubject(ip: string) {
  const value = ip.trim().toLowerCase().slice(0, 64);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return mapped[1];
  if (!value.includes(":")) return value;
  const [head, tail = ""] = value.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = value.includes("::") ? [...headGroups, ...Array(missing).fill("0"), ...tailGroups] : headGroups;
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":");
}

// Pedidos web: por IP, 6 por minuto y 20 por día, contados en la base para que valgan entre instancias.
// Si frena el minuto no gasta el cupo diario: un cliente que reintenta no se queda sin comprar por el resto del día.
export async function checkOrderRateLimit(ip: string): Promise<RateLimitResult> {
  const subject = rateLimitSubject(ip);
  const minute = await hitRateLimit(`orders:min:${subject}`, 6, 60_000);
  if (minute.limited) return minute;
  return hitRateLimit(`orders:day:${subject}`, 20, 24 * 60 * 60_000);
}

export function tooManyRequests(retryAfterSeconds: number, message: string): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
