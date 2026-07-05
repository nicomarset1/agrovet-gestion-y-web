import { getSpecialCategoryHref } from "./special-categories";
import type { CatalogMenuNode, Category, Product } from "./types";

export function buildCustomerCatalogMenu(products: Product[], categories: Category[]): CatalogMenuNode[] {
  const title = (value: string) => value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const petNode = (pet: "perro" | "gato", label: string): CatalogMenuNode => {
    const petProducts = products.filter((product) => product.species === pet);
    const typeChildren = categories
      .filter((category) => category.parentCategorySlug === pet)
      .map((category) => {
        const count = petProducts.filter((product) => product.categorySlug === category.slug).length;
        return {
          label: category.name,
          href: `/tienda?category=${category.slug}&pet=${pet}`,
          count,
        };
      })
      .filter((item) => item.count >= 5);

    const brandCounts = new Map<string, number>();
    const stageCounts = new Map<string, number>();
    for (const product of petProducts) {
      brandCounts.set(product.brand, (brandCounts.get(product.brand) ?? 0) + 1);
      if (product.lifeStage) stageCounts.set(product.lifeStage, (stageCounts.get(product.lifeStage) ?? 0) + 1);
    }

    const brandChildren = [...brandCounts.entries()]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([brand, count]) => ({
        label: brand,
        href: `/tienda?pet=${pet}&brand=${encodeURIComponent(brand)}`,
        count,
      }));

    const stageChildren = [...stageCounts.entries()]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => ({
        label: title(stage),
        href: `/tienda?pet=${pet}&stage=${encodeURIComponent(stage)}`,
        count,
      }));

    return {
      label,
      href: `/tienda?pet=${pet}`,
      count: petProducts.length,
      children: [
        { label: `Alimentos para ${pet}`, href: `/tienda?pet=${pet}`, children: typeChildren },
        { label: "Marcas destacadas", href: `/tienda?pet=${pet}`, children: brandChildren },
        { label: "Etapa de vida", href: `/tienda?pet=${pet}`, children: stageChildren },
      ],
    };
  };

  const brands = new Map<string, number>();
  for (const product of products) {
    brands.set(product.brand, (brands.get(product.brand) ?? 0) + 1);
  }
  const brandChildren = [...brands.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([brand, count]) => ({
      label: brand,
      href: `/tienda?brand=${encodeURIComponent(brand)}`,
      count,
    }));

  const foodNode: CatalogMenuNode = {
    label: "Alimentos",
    href: "/tienda",
    children: [
      {
        label: "Para perros",
        href: "/tienda?pet=perro",
        children: categories
          .filter((category) => category.parentCategorySlug === "perro")
          .map((category) => {
            const count = products.filter((product) => product.categorySlug === category.slug && product.species === "perro").length;
            return { label: category.name, href: `/tienda?category=${category.slug}&pet=perro`, count };
          })
          .filter((item) => item.count >= 5),
      },
      {
        label: "Para gatos",
        href: "/tienda?pet=gato",
        children: categories
          .filter((category) => category.parentCategorySlug === "gato")
          .map((category) => {
            const count = products.filter((product) => product.categorySlug === category.slug && product.species === "gato").length;
            return { label: category.name, href: `/tienda?category=${category.slug}&pet=gato`, count };
          })
          .filter((item) => item.count >= 5),
      },
      { label: "Marcas", href: "/tienda", children: brandChildren },
    ],
  };

  const specialNodes = categories
    .filter((category) => category.showInMenu && !category.parentCategoryId && !["perro", "gato"].includes(category.slug))
    .map((category) => ({
      label: category.name,
      href: getSpecialCategoryHref(category.slug) ?? `/tienda?category=${category.slug}`,
    }));

  return [
    petNode("perro", "Perros"),
    petNode("gato", "Gatos"),
    foodNode,
    { label: "Accesorios", href: "/tienda?category=accesorios" },
    ...specialNodes,
  ];
}
