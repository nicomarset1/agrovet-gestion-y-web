"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteReview, setReviewStatus } from "@/lib/db";

const idSchema = z.object({ id: z.coerce.number().int().positive() });

async function parseId(formData: FormData) {
  await requireAdmin();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Reseña inválida.");
  return parsed.data.id;
}

export async function publishReviewAction(formData: FormData) {
  const id = await parseId(formData);
  await setReviewStatus(id, "published");
  revalidatePath("/admin/resenas");
}

export async function hideReviewAction(formData: FormData) {
  const id = await parseId(formData);
  await setReviewStatus(id, "hidden");
  revalidatePath("/admin/resenas");
}

export async function deleteReviewAction(formData: FormData) {
  const id = await parseId(formData);
  await deleteReview(id);
  revalidatePath("/admin/resenas");
}
