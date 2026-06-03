import { CartPage } from "@/components/cart-page";
import { getBranches } from "@/lib/db";

export const metadata = { title: "Carrito" };

export default async function CartRoute() {
  return <CartPage branches={await getBranches()} />;
}
