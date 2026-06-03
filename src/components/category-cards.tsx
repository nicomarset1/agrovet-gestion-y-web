import Link from "next/link";
import { Bone, Cross, Droplets, PackageOpen, PawPrint } from "lucide-react";

const categories = [
  { slug: "alimentos", name: "Alimentos", caption: "Secos, humedos y dietas", icon: PackageOpen },
  { slug: "gato", name: "Gatos", caption: "Food, snacks y sanitario", icon: PawPrint },
  { slug: "perro", name: "Perros", caption: "Food, paseo y farmacia", icon: PawPrint },
  { slug: "farmacia", name: "Farmacia", caption: "Pulgas y antiparasitarios", icon: Cross },
  { slug: "accesorios", name: "Accesorios", caption: "Paseo, juego y descanso", icon: Bone },
  { slug: "higiene", name: "Higiene", caption: "Sanitario y cuidado", icon: Droplets },
];

export function CategoryCards() {
  return (
    <div className="categories">
      {categories.map(({ slug, name, caption, icon: Icon }) => (
        <Link className="card category" href={`/tienda?category=${slug}`} key={slug}>
          <span className="category-icon"><Icon size={23} /></span>
          <strong>{name}</strong>
          <small>{caption}</small>
        </Link>
      ))}
    </div>
  );
}
