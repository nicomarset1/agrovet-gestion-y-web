"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";

export function CartButton() {
  const { totalItems } = useCart();
  return (
    <Link className="nav-cart" href="/carrito" aria-label={`Carrito con ${totalItems} productos`}>
      <ShoppingBag size={21} />
      {totalItems > 0 && <span className="cart-count">{totalItems}</span>}
      Carrito
    </Link>
  );
}
