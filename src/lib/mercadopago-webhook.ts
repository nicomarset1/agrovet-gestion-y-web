import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type SignatureParts = {
  ts: string;
  v1: string;
};

function getWebhookSecret() {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Falta configurar MERCADOPAGO_WEBHOOK_SECRET.");
  }
  return secret;
}

export function hasMercadoPagoWebhookSecret() {
  return Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim());
}

function parseSignature(signature: string): SignatureParts | null {
  const ts = /(?:^|,)ts=(\d+)(?:,|$)/.exec(signature)?.[1] ?? "";
  const v1 = /(?:^|,)v1=([a-f0-9]+)(?:,|$)/i.exec(signature)?.[1] ?? "";
  if (!ts || !v1) return null;
  return { ts, v1 };
}

function buildManifest(params: { dataId?: string; requestId?: string; ts: string }) {
  const parts: string[] = [];
  if (params.dataId) parts.push(`id:${params.dataId}`);
  if (params.requestId) parts.push(`request-id:${params.requestId}`);
  if (params.ts) parts.push(`ts:${params.ts}`);
  return `${parts.join(";")};`;
}

export function validateMercadoPagoWebhookSignature(request: Request, dataId: string) {
  const signatureHeader = request.headers.get("x-signature")?.trim();
  const requestId = request.headers.get("x-request-id")?.trim();
  if (!signatureHeader || !requestId) return false;

  const parsed = parseSignature(signatureHeader);
  if (!parsed) return false;

  const manifest = buildManifest({ dataId, requestId, ts: parsed.ts });
  const expected = createHmac("sha256", getWebhookSecret()).update(manifest).digest();
  const supplied = Buffer.from(parsed.v1, "hex");
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}
