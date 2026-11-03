import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { secret } from "./auth";

// Prueba de que quien vuelve de Mercado Pago o reintenta es quien creó el pedido: el código del pedido es
// adivinable, este token no. El prefijo evita que una firma de sesión sirva como token de pedido, o al revés.
export function orderToken(code: string) {
  return createHmac("sha256", secret()).update(`order-return:${code}`).digest("hex");
}

export function isValidOrderToken(code: string, token: string | null | undefined) {
  if (!code || !token) return false;
  try {
    const expected = Buffer.from(orderToken(code));
    const supplied = Buffer.from(token);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    // Sin secreto configurado no se puede validar nada: se trata como inválido, nunca como una excepción en la ruta.
    return false;
  }
}
