"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { saveCart, useCartItems, type CartItem } from "@/lib/cart";
import { useLocalization } from "@/components/layout/localization-provider";
import { LocalCheckoutLink } from "@/components/layout/local-checkout-link";

export function CartPageClient() {
  const { currency, formatPrice, convertMajorAmount } = useLocalization();
  const items = useCartItems();
  const sourceCurrency = items[0]?.currency ?? "JPY";
  const subtotal = useMemo(() => convertMajorAmount(items.reduce((sum, item) => sum + item.price * item.qty, 0), sourceCurrency), [convertMajorAmount, items, sourceCurrency]);
  const quantity = items.reduce((sum, item) => sum + item.qty, 0);

  function update(next: CartItem[]) {
    saveCart(next);
    window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: next }));
  }

  return (
    <div className={`store-container cart-page-content${items.length ? " has-items" : " is-empty"}`}>
      <header className="cart-page-heading">
        <div><p className="eyebrow">A LITTLE BUNDLE OF JOY</p><h1>{items.length ? "Your cart" : "Your cart is waiting"}</h1><p>{items.length ? `${quantity} lovely ${quantity === 1 ? "find" : "finds"}, ready for their new home.` : "A forever friend is just around the corner."}</p></div>
        <Link href="/collections/all" className="cart-continue-link"><span aria-hidden="true">←</span> Keep exploring</Link>
      </header>

      {items.length === 0 ? <section className="cart-empty-state">
        <div className="cart-empty-art" aria-hidden="true"><span>♡</span><i>✦</i><b>🪼</b></div>
        <p className="cart-empty-eyebrow">YOUR NEXT FOREVER FRIEND</p>
        <h2>There’s room for something lovely.</h2>
        <p>Discover rare finds, premium favorites, and oversized companions picked with care.</p>
        <Link className="shop-button shop-button-orange" href="/collections/all">Explore the collection <b>→</b></Link>
        <nav className="cart-empty-links" aria-label="Explore plush categories"><Link href="/collections/rare-finds">Rare finds</Link><Link href="/collections/bears">Bears</Link><Link href="/collections/bunnies">Bunnies</Link><Link href="/collections/domina-xl">Domina XL</Link></nav>
      </section> : <div className="cart-page-layout">
        <section className="cart-line-list" aria-label="Items in your cart">
          <div className="cart-items-heading"><span>Plush picked for you</span><span>{quantity} {quantity === 1 ? "item" : "items"}</span></div>
          {items.map((item) => <article className="cart-line" key={item.id}>
            {item.catalogId ? <Link href={`/products/${item.catalogId}`} className="cart-line-image"><CartLineImage item={item} /></Link> : <span className="cart-line-image"><CartLineImage item={item} /></span>}
            <div className="cart-line-info">
              <span className="cart-line-maker">{item.maker}</span>
              {item.catalogId ? <Link href={`/products/${item.catalogId}`} className="cart-line-name">{item.name}</Link> : <span className="cart-line-name">{item.name}</span>}
              <span className="cart-line-ready"><i aria-hidden="true" /> Ready to be loved</span>
              <strong className="cart-line-unit-price">{formatPrice(item.price, item.currency)} <small>each</small></strong>
              <div className="cart-line-controls" aria-label={`Quantity for ${item.name}`}>
                <button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.qty <= 1} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: Math.max(1, entry.qty - 1) } : entry))}>−</button>
                <span aria-live="polite">{item.qty}</span>
                <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: Math.min(20, entry.qty + 1) } : entry))}>＋</button>
                <button type="button" className="cart-remove" onClick={() => update(items.filter((entry) => entry.id !== item.id))}>Remove</button>
              </div>
            </div>
            <strong className="cart-line-total">{formatPrice(item.price * item.qty, item.currency)}</strong>
          </article>)}
          <div className="cart-bottom-promise"><span aria-hidden="true">✦</span><p><strong>A thoughtful pick, packed with care.</strong><small>Every Ponyo plush is chosen to bring a little more joy home.</small></p></div>
        </section>

        <aside className="cart-summary" aria-labelledby="cart-summary-title">
          <div className="cart-summary-heading"><div><p className="eyebrow">ALMOST YOURS</p><h2 id="cart-summary-title">Order summary</h2></div><span className="cart-summary-count">{quantity}</span></div>
          <div className="cart-summary-line"><span>Subtotal</span><strong>{formatPrice(subtotal, currency)}</strong></div>
          <div className="cart-summary-line"><span>Shipping</span><span className="cart-shipping-value">Calculated at checkout</span></div>
          <p className="cart-summary-tax">Taxes and delivery are confirmed for your Japan address at checkout.</p>
          <LocalCheckoutLink className="shop-button shop-button-orange cart-checkout-button">Continue to checkout <b>→</b></LocalCheckoutLink>
          <div className="cart-secure-note"><span aria-hidden="true">♧</span><span>Secure checkout · Your payment details stay protected</span></div>
          <Link className="cart-back-to-shop" href="/collections/all">Continue discovering plush <span aria-hidden="true">→</span></Link>
        </aside>
      </div>}
    </div>
  );
}

function CartLineImage({ item }: { item: CartItem }) {
  const [source, setSource] = useState(item.image);
  return <img src={source} alt={item.imageAlt} // eslint-disable-line @next/next/no-img-element
    onError={() => {
    if (source !== "/images/plushies-home-2.png") setSource("/images/plushies-home-2.png");
  }} />;
}
