import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const categories = [
  {
    href: "/tienda?pet=perro",
    image: "/home-assets/category-dogs-clean.png",
    name: "Perros",
  },
  {
    href: "/tienda?pet=gato",
    image: "/home-assets/category-cats-clean.png",
    name: "Gatos",
  },
  {
    href: "/tienda?category=perro-snacks",
    image: "/home-assets/category-accessories-clean.png",
    name: "Snacks y cuidado",
  },
  {
    href: "/tienda?category=perro-alimento-veterinario",
    image: "/home-assets/category-pharmacy-clean.png",
    name: "Alimento veterinario",
  },
];

export function CategoryCards() {
  return (
    <div className="categories visual-categories">
      {categories.map((category) => (
        <article className="visual-category" key={category.name}>
          <Image
            alt=""
            className="visual-category-image"
            fill
            sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 1000px) 50vw, 33vw"
            src={category.image}
          />
          <Link aria-label={`Ver productos de ${category.name}`} className="visual-category-button" href={category.href}>
            Ver productos <ArrowRight size={18} />
          </Link>
        </article>
      ))}
    </div>
  );
}
