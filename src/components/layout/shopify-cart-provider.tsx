"use client";

import { useEffect } from "react";
import { readCart, saveCart, type CartItem } from "@/lib/cart";
import { publishShopifyCart } from "@/lib/shopify-cart-state";

/** Local cart preview only; no Shopify API or credentials are required. */
export function ShopifyCartProvider() {
  useEffect(() => {
    publishShopifyCart(null, readCart());

    const onAdd = (event: Event) => {
      const item = (event as CustomEvent<Omit<CartItem, "qty"> & { qty?: number }>).detail;
      if (!item) return;
      const current = readCart();
      const existing = current.find((entry) => entry.id === item.id);
      const next = existing
        ? current.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + (item.qty ?? 1) } : entry)
        : [...current, { ...item, qty: item.qty ?? 1 }];
      saveCart(next);
      publishShopifyCart(null, next);
      window.dispatchEvent(new Event("ponyo:cart-open"));
    };

    const onLocalCartUpdate = () => publishShopifyCart(null, readCart());
    window.addEventListener("ponyo:add-to-cart", onAdd);
    window.addEventListener("ponyo:local-cart-update", onLocalCartUpdate);
    return () => {
      window.removeEventListener("ponyo:add-to-cart", onAdd);
      window.removeEventListener("ponyo:local-cart-update", onLocalCartUpdate);
    };
  }, []);

  return null;
}