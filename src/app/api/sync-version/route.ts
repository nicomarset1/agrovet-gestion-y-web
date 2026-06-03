import { getSyncVersion } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ version: await getSyncVersion() }, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
