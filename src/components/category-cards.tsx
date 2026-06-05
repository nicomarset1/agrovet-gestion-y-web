import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const categories = [
  {
    href: "/tienda?pet=perro",
    image: "/home-assets/category-dogs.png",
    name: "Perros",
  },
  {
    href: "/tienda?pet=gato",
    image: "/home-assets/category-cats.png",
    name: "Gatos",
  },
  {
    href: "/tienda?category=accesorios",
    image: "/home-assets/category-accessories.png",
    name: "Accesorios",
  },
];

export function CategoryCards() {
  return (
    <div className="categories visual-categories">
      {categories.map((category) => (
        <Link aria-label={`Ver productos de ${category.name}`} className="visual-category" href={category.href} key={category.name}>
          <Image
            alt=""
            className="visual-category-image"
            fill
            sizes="(max-width: 640px) calc(100vw - 28px), (max-width: 1000px) 50vw, 33vw"
            src={category.image}
          />
          <span className="visual-category-button">
            Ver productos <ArrowRight size={18} />
          </span>
        </Link>
      ))}
    </div>
  );
}
