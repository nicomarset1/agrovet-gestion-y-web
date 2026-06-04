import "server-only";

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

export function tooManyRequests(retryAfterSeconds: number, message: string): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
