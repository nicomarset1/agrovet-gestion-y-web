import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteOrder } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
  }
  deleteOrder(parsed.data.id);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/tienda");
  return NextResponse.json({ ok: true });
}
