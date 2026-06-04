import "server-only";

import { getCategories } from "./db";

export async function getSpecialPageDescription(slug: string, fallback: string) {
  const category = (await getCategories()).find((item) => item.slug === slug);
  const description = category?.description.trim();
  return description && !/pagina especial|p.gina especial/i.test(description) ? description : fallback;
}
