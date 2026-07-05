import "server-only";

const MAX_JSON_BYTES = 32_000;

function trustedHosts(request: Request) {
  const hosts = new Set<string>();
  hosts.add(new URL(request.url).host);

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      hosts.add(new URL(configured).host);
    } catch {
      // Ignore malformed deploy configuration and fall back to request host.
    }
  }

  const vercel = process.env.VERCEL_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) hosts.add(vercel.replace(/^https?:\/\//, "").replace(/\/$/, ""));

  return hosts;
}

export function isSameOriginMutation(request: Request) {
  const allowedHosts = trustedHosts(request);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      return allowedHosts.has(parsed.host) && (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const parsed = new URL(referer);
      return allowedHosts.has(parsed.host) && (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  }

  return process.env.NODE_ENV !== "production";
}

export async function readBoundedJson(request: Request, maxBytes = MAX_JSON_BYTES) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function forbiddenMutationResponse() {
  return Response.json({ error: "Solicitud inválida." }, { status: 403 });
}
