import type { Metadata } from "next";
import { CartPage } from "@/components/cart-page";
import { getBranches } from "@/lib/db";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: true },
};

export default async function CartRoute() {
  return <CartPage branches={await getBranches()} />;
}
