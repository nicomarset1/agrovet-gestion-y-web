"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { setLowStockThreshold } from "@/lib/db";

export async function setThresholdAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ threshold: z.coerce.number().int().min(0).max(9999) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Umbral inválido.");
  await setLowStockThreshold(parsed.data.threshold);
  revalidatePath("/admin/stock-bajo");
}
