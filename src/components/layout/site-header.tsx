"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type CartItem = {
  id: string;
  slug: string;
  name: string;
  maker: string;
  price: number;
  currency: string;
  image: string;
  imageAlt: string;
  qty: number;
};

const cartStorageKey = "ponyo-cart-v1";

function JellyfishMark() {
  return (
    <svg className="icon-jelly" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="var(--rose)" />
      <path d="M18 27C18 18 24 11 32 11C40 11 46 18 46 27" fill="none" stroke="var(--white)" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <circle cx="26" cy="23" r="2.6" fill="var(--cocoa)" /><circle cx="38" cy="23" r="2.6" fill="var(--cocoa)" />
      <path d="M22 29c1.4 1.6 3 1.6 4.4 0" stroke="var(--cocoa)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" stroke="var(--rose)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".85" />
    </svg>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function BagIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const itemCount = cart.reduce((total, item) => total + item.qty, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.qty, 0);

  useEffect(() => {
    const addItem = (event: Event) => {
      const item = (event as CustomEvent<Omit<CartItem, "qty">>).detail;
      setCart((current) => {
        const existing = current.find((entry) => entry.id === item.id);
        const updated = existing
          ? current.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry)
          : [...current, { ...item, qty: 1 }];
        try { localStorage.setItem(cartStorageKey, JSON.stringify(updated)); } catch { /* Storage is optional. */ }
        return updated;
      });
    };
    window.addEventListener("ponyo:add-to-cart", addItem);
    return () => window.removeEventListener("ponyo:add-to-cart", addItem);
  }, []);

  useEffect(() => {
    if (!bagOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBagOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bagOpen]);

  return (
    <>
      <div className="announce-bar"><p><span className="announce-moon" aria-hidden="true">☾</span><span className="announcement-copy">Extraordinary Finds. Impossible to Ignore.</span><span className="announce-star" aria-hidden="true">✦</span></p></div>
      <header className="site-header">
        <div className="container header-inner">
          <button className="icon-btn mobile-only" id="menuToggle" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <span className="bar" /><span className="bar" /><span className="bar" />
          </button>
          <Link href="/" className="logo" aria-label="Ponyo home">
            <span className="logo-mark"><JellyfishMark /></span><span className="logo-word">PONYO</span>
          </Link>
          <nav className="main-nav desktop-only" aria-label="Main navigation">
            <Link href="/#rare-finds" className="is-active">Trending</Link>
            <Link href="/shop">Shop All</Link>
            <Link href="/#new-limited">New Arrivals</Link>
            <Link href="/shop?category=giant-plush">Giant Plush</Link>
          </nav>
          <div className="header-actions">
            <form className="search-pill desktop-only" action="/shop" method="get" role="search">
              <SearchIcon /><input id="headerSearchInput" type="search" name="q" placeholder="Search for plushies..." aria-label="Search for plushies" />
            </form>
            <Link href="/orders" className="icon-btn" aria-label="Account"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4.5 20c1.6-4 4.2-6 7.5-6s5.9 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></Link>
            <Link href="/orders" className="icon-btn" aria-label="Wishlist"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-10-9.2C.3 7.8 2.3 4 6 4c2.1 0 3.8 1.2 6 3.7C14.2 5.2 15.9 4 18 4c3.7 0 5.7 3.8 4 7.3-2.5 4.6-10 9.2-10 9.2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></Link>
            <button className="icon-btn bag-btn" id="bagToggle" type="button" aria-label={`Bag, ${itemCount} items`} aria-expanded={bagOpen} onClick={() => setBagOpen(true)}>
              <BagIcon /><span className="bag-count">{itemCount}</span>
            </button>
          </div>
        </div>
        <form className="mobile-search-row" action="/shop" method="get" role="search">
          <SearchIcon /><input type="search" name="q" placeholder="Search plush..." aria-label="Search plush" /><button type="submit">Search</button>
        </form>
        <nav className={`mobile-nav${menuOpen ? " is-open" : ""}`} id="mobileNav" aria-label="Mobile navigation">
          <Link href="/#rare-finds" onClick={() => setMenuOpen(false)}>Trending</Link>
          <Link href="/shop" onClick={() => setMenuOpen(false)}>Shop All</Link>
          <Link href="/#new-limited" onClick={() => setMenuOpen(false)}>New Arrivals</Link>
          <Link href="/shop?category=giant-plush" onClick={() => setMenuOpen(false)}>Giant Plush</Link>
        </nav>
      </header>
      <aside className={`bag-drawer${bagOpen ? " is-open" : ""}`} id="bagDrawer" aria-label="Shopping bag" aria-hidden={!bagOpen}>
        <div className="bag-drawer-head"><h3>Your Bag <span>({itemCount})</span></h3><button className="icon-btn" type="button" id="bagClose" aria-label="Close bag" onClick={() => setBagOpen(false)}>✕</button></div>
        {cart.length === 0 ? (
          <p className="empty-bag-note">Your bag is waiting for a plush to love.</p>
        ) : cart.map((item) => (
          <div className="bag-item" key={item.id}>
            <div className="ph-thumb cart-thumb-sm"><Image src={item.image} alt={item.imageAlt} width={72} height={72} /></div>
            <div className="bag-item-info"><p className="bag-item-maker">{item.maker}</p><p className="bag-item-name">{item.name}</p><p className="bag-item-price">{item.currency === "JPY" ? `¥${item.price.toLocaleString("en-US")}` : item.price}</p><p>Qty {item.qty}</p></div>
          </div>
        ))}
        <div className="bag-drawer-foot">
          <div className="bag-subtotal"><span>Subtotal</span><strong>¥{subtotal.toLocaleString("en-US")}</strong></div>
          <p className="bag-note">Order submission and payment are not enabled in this MVP preview.</p>
          <Link href={cart.length ? "/checkout" : "/shop"} className="btn btn-primary btn-block" onClick={() => setBagOpen(false)}>{cart.length ? "Continue to checkout" : "Continue shopping"}</Link>
        </div>
      </aside>
      <button className={`scrim${bagOpen ? " is-open" : ""}`} type="button" aria-label="Close shopping bag" tabIndex={bagOpen ? 0 : -1} onClick={() => setBagOpen(false)} />
    </>
  );
}
