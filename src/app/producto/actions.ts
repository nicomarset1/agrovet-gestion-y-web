"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createReview } from "@/lib/db";

export type ReviewState = { ok?: boolean; error?: string };

const reviewSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productSlug: z.string().trim().min(1).max(120),
  authorName: z.string().trim().min(2).max(60),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(5).max(600),
});

export async function createReviewAction(_: ReviewState, formData: FormData): Promise<ReviewState> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisá los datos: nombre (mín. 2), puntaje y comentario (mín. 5 caracteres)." };
  }
  try {
    await createReview({
      productId: parsed.data.productId,
      authorName: parsed.data.authorName,
      rating: parsed.data.rating,
      body: parsed.data.body,
    });
  } catch {
    return { error: "No pudimos guardar tu reseña. Intentá de nuevo." };
  }
  revalidatePath(`/producto/${parsed.data.productSlug}`);
  return { ok: true };
}
