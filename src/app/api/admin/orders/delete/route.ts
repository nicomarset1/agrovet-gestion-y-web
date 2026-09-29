import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteOrder } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isSameOriginMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  await requireAdmin();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 403 });
  }
  const formData = await request.formData();
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
  }
  await deleteOrder(parsed.data.id);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/tienda");
  return NextResponse.json({ ok: true });
}
