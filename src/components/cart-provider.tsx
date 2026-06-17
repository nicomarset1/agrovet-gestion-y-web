"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, RotateCcw } from "lucide-react";
import type { Stock } from "@/lib/types";
import { useToast } from "./toast-provider";

export type CartItem = {
  variantId: number;
  productSlug: string;
  name: string;
  brand: string;
  label: string;
  priceCents: number;
  quantity: number;
  stocks: Stock[];
};

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  totalCents: number;
  add: (item: Omit<CartItem, "quantity">) => void;
  change: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const key = "agrovet-cart";

function readCartItems() {
  const saved = window.localStorage.getItem(key);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as CartItem[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const hydrated = useRef(false);
  const { push } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(readCartItems());
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      hydrated.current = true;
      setItems(readCartItems());
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncFromStorage();
    };
    window.addEventListener("pageshow", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("pageshow", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (hydrated.current) window.localStorage.setItem(key, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    totalCents: items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
    add: (incoming) => {
      push({ title: "Producto agregado", message: `${incoming.brand} ${incoming.name} - ${incoming.label}`, type: "success" });
      setItems((current) => {
      const found = current.find((item) => item.variantId === incoming.variantId);
      if (found) return current.map((item) => item.variantId === incoming.variantId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...incoming, quantity: 1 }];
      });
    },
    change: (variantId, quantity) => {
      const nextQuantity = Math.max(1, quantity);
      const found = items.find((item) => item.variantId === variantId);
      if (found && found.quantity !== nextQuantity) {
        push({ title: "Cantidad actualizada", message: `${found.name}: ${nextQuantity}`, type: "info", icon: ArrowUpDown });
      }
      setItems((current) => current.map((item) => item.variantId === variantId ? { ...item, quantity: nextQuantity } : item));
    },
    remove: (variantId) => {
      const found = items.find((item) => item.variantId === variantId);
      if (found) push({ title: "Producto eliminado", message: `${found.brand} ${found.name}`, type: "danger" });
      setItems((current) => current.filter((item) => item.variantId !== variantId));
    },
    clear: () => {
      if (items.length) push({ title: "Carrito vaciado", type: "info", icon: RotateCcw });
      setItems([]);
    },
  }), [items, push]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be inside CartProvider");
  return value;
}
