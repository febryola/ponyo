"use client";

import { useEffect } from "react";
import { readCart, saveCart, type CartItem } from "@/lib/cart";

export function LocalCartProvider() {
  useEffect(() => {
    const onAdd = (event: Event) => {
      const item = (event as CustomEvent<Omit<CartItem, "qty"> & { qty?: number }>).detail;
      if (!item) return;
      const current = readCart();
      const existing = current.find((entry) => entry.id === item.id);
      const next = existing
        ? current.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + (item.qty ?? 1) } : entry)
        : [...current, { ...item, qty: item.qty ?? 1 }];
      saveCart(next);
      window.dispatchEvent(new Event("ponyo:cart-open"));
    };

    window.addEventListener("ponyo:add-to-cart", onAdd);
    return () => {
      window.removeEventListener("ponyo:add-to-cart", onAdd);
    };
  }, []);

  return null;
}