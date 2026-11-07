"use client";

import Image from "next/image";
import Link from "next/link";
import { saveCart, useCartItems, type CartItem } from "@/lib/cart";
import { formatPrice } from "@/lib/utils/format-price";
import { LocalCheckoutLink } from "@/components/layout/local-checkout-link";

export function CartPageClient() {
  const items = useCartItems();
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currency = items[0]?.currency ?? "JPY";

  function update(next: CartItem[]) {
    saveCart(next);
    window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: next }));
  }

  return (
    <div className="store-container cart-page-content">
      <nav className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><span>Cart</span></nav>
      <div className="cart-page-heading"><div><p className="eyebrow">A LITTLE BUNDLE OF JOY</p><h1>Your cart</h1></div><Link href="/shop" className="text-link">Continue shopping →</Link></div>
      {items.length === 0 ? <div className="cart-empty-state"><span>♡</span><h2>Your cart is empty.</h2><p>Find a rare, premium or giant plush friend to take home.</p><Link className="shop-button shop-button-orange" href="/collections/all">Continue shopping <b>→</b></Link><nav className="cart-empty-links"><span>Shop by type</span><Link href="/collections/bears">Bears</Link><Link href="/collections/bunnies">Bunnies</Link><Link href="/collections/new-arrivals">New Discoveries</Link><Link href="/collections/domina-xl">Domina XL</Link></nav></div> : (
        <div className="cart-page-layout">
          <div className="cart-line-list">{items.map((item) => <article className="cart-line" key={item.id}><Link href={`/products/${item.slug}`} className="cart-line-image"><Image src={item.image} alt={item.imageAlt} fill sizes="120px" /></Link><div className="cart-line-info"><span>{item.maker}</span><Link href={`/products/${item.slug}`}>{item.name}</Link><strong>{formatPrice(item.price, item.currency)} <small>each</small></strong><div className="cart-line-controls"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.qty <= 1} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty - 1 } : entry))}>−</button><span>{item.qty}</span><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry))}>＋</button><button type="button" className="cart-remove" onClick={() => update(items.filter((entry) => entry.id !== item.id))}>Remove</button></div></div><strong className="cart-line-total">{formatPrice(item.price * item.qty, item.currency)}</strong></article>)}</div>
          <aside className="cart-summary"><h2>Order summary</h2><div><span>Subtotal</span><strong>{formatPrice(total, currency)}</strong></div><div><span>Shipping</span><strong>Calculated at checkout</strong></div><LocalCheckoutLink className="shop-button shop-button-orange">Checkout securely <b>→</b></LocalCheckoutLink><small>Taxes and shipping are calculated at checkout.</small></aside>
        </div>
      )}
    </div>
  );
}
