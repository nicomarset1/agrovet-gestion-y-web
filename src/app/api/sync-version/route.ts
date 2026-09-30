import { getSyncVersion } from "@/lib/db";

// Sin `dynamic = "force-dynamic"`: eso fuerza fetchCache "force-no-store" y hace que unstable_cache
// se saltee la caché, con lo que cada consulta del panel (cada 2 s) volvería a despertar la base.
// getSyncVersion ya marca la respuesta como dinámica con noStore().
export async function GET() {
  return Response.json({ version: await getSyncVersion() }, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
