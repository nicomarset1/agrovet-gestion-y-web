export function formatPrice(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function initials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");
}
