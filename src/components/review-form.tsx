"use client";

import { useActionState } from "react";
import { createReviewAction, type ReviewState } from "@/app/producto/actions";

const ratingOptions = [5, 4, 3, 2, 1];

export function ReviewForm({ productId, productSlug }: { productId: number; productSlug: string }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(createReviewAction, {});

  if (state.ok) {
    return (
      <div className="card review-thanks" role="status">
        ¡Gracias por tu reseña! Queda pendiente de aprobación antes de publicarse.
      </div>
    );
  }

  return (
    <form action={formAction} className="card review-form">
      <h3>Dejá tu reseña</h3>
      <input name="productId" type="hidden" value={productId} />
      <input name="productSlug" type="hidden" value={productSlug} />

      <label className="review-field-label" htmlFor="review-name">Tu nombre</label>
      <input className="field" id="review-name" maxLength={60} minLength={2} name="authorName" required />

      <fieldset className="review-rating">
        <legend>Puntaje</legend>
        {ratingOptions.map((value) => (
          <label className="review-rating-option" key={value}>
            <input defaultChecked={value === 5} name="rating" required type="radio" value={value} />
            <span>{value} {value === 1 ? "estrella" : "estrellas"}</span>
          </label>
        ))}
      </fieldset>

      <label className="review-field-label" htmlFor="review-body">Comentario</label>
      <textarea className="field" id="review-body" maxLength={600} minLength={5} name="body" rows={4} required />

      {state.error && <p className="notice error">{state.error}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Enviando..." : "Enviar reseña"}
      </button>
    </form>
  );
}
