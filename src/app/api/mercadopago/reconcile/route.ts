import { reconcileMercadoPagoIfDue } from "@/lib/mercadopago-sync";

// Lo llama el cron diario de Vercel (vercel.json). Además corre sola desde el panel cada 30 minutos.
// Si está definido CRON_SECRET, Vercel lo manda como Bearer y se exige. Sin él queda abierta, pero no
// expone nada y no corre más de una vez cada 30 minutos (el turno se guarda en la base).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const result = await reconcileMercadoPagoIfDue();
  return Response.json({ ok: true, ran: Boolean(result) });
}
