import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminReviews } from "@/lib/db";
import type { ReviewStatus } from "@/lib/types";
import { deleteReviewAction, hideReviewAction, publishReviewAction } from "./actions";

export const metadata = { title: "Reseñas", robots: { index: false, follow: false } };

const statusLabel: Record<ReviewStatus, string> = {
  pending: "Pendiente",
  published: "Publicada",
  hidden: "Oculta",
};

function stars(rating: number) {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function AdminReviewsPage() {
  await requireAdmin();
  const reviews = await getAdminReviews();
  const pending = reviews.filter((review) => review.status === "pending").length;

  return (
    <div className="admin-shell">
      <div className="container">
        <div className="reviews-admin-head">
          <div>
            <h1>Reseñas</h1>
            <p className="muted">{pending} pendiente{pending === 1 ? "" : "s"} de moderación · {reviews.length} en total</p>
          </div>
          <Link className="button button-light" href="/admin">← Volver al panel</Link>
        </div>

        {reviews.length === 0 ? (
          <p className="muted">Todavía no hay reseñas.</p>
        ) : (
          <ul className="reviews-admin-list">
            {reviews.map((review) => (
              <li className="card review-item" key={review.id}>
                <div className="review-item-head">
                  <div>
                    <strong>{review.authorName}</strong>{" · "}
                    <Link href={`/producto/${review.productSlug}`}>{review.productName}</Link>{" "}
                    <span className={`review-status review-status-${review.status}`}>{statusLabel[review.status]}</span>
                  </div>
                  <span aria-label={`${review.rating} de 5 estrellas`} className="reviews-stars">{stars(review.rating)}</span>
                </div>
                <time className="review-date" dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
                <p>{review.body}</p>
                <div className="review-admin-actions">
                  {review.status !== "published" && (
                    <form action={publishReviewAction}>
                      <input name="id" type="hidden" value={review.id} />
                      <button className="button button-primary" type="submit">Publicar</button>
                    </form>
                  )}
                  {review.status !== "hidden" && (
                    <form action={hideReviewAction}>
                      <input name="id" type="hidden" value={review.id} />
                      <button className="button button-light" type="submit">Ocultar</button>
                    </form>
                  )}
                  <form action={deleteReviewAction}>
                    <input name="id" type="hidden" value={review.id} />
                    <button className="button button-light" type="submit">Eliminar</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
