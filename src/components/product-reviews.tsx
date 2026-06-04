import type { ProductReview } from "@/lib/types";
import { ReviewForm } from "./review-form";

function stars(rating: number) {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(new Date(value));
}

export function ProductReviews({ productId, productSlug, reviews }: { productId: number; productSlug: string; reviews: ProductReview[] }) {
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;

  return (
    <section className="product-reviews">
      <div className="reviews-head">
        <h2 className="display">Reseñas</h2>
        {count ? (
          <p className="reviews-summary">
            <span aria-label={`${average.toFixed(1)} de 5 estrellas`} className="reviews-stars">{stars(average)}</span>
            <strong>{average.toFixed(1)}</strong>
            <span className="muted">· {count} {count === 1 ? "reseña" : "reseñas"}</span>
          </p>
        ) : (
          <p className="reviews-summary muted">Todavía no hay reseñas. ¡Sé el primero en opinar!</p>
        )}
      </div>

      {count > 0 && (
        <ul className="reviews-list">
          {reviews.map((review) => (
            <li className="card review-item" key={review.id}>
              <div className="review-item-head">
                <strong>{review.authorName}</strong>
                <span aria-label={`${review.rating} de 5 estrellas`} className="reviews-stars">{stars(review.rating)}</span>
              </div>
              <time className="review-date" dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
              <p>{review.body}</p>
            </li>
          ))}
        </ul>
      )}

      <ReviewForm productId={productId} productSlug={productSlug} />
    </section>
  );
}
