"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveCart, useCartItems } from "@/lib/cart";
import { StoreSearch } from "@/components/layout/store-search";
import { formatPrice } from "@/lib/utils/format-price";

const mainLinks = [
  { title: "Discover", href: "/" },
  { title: "Shop All", href: "/collections/all" },
  { title: "Rare Finds", href: "/collections/rare-finds" },
  { title: "Premium Plushies", href: "/collections/premium" },
  { title: "XL Goodies", href: "/collections/domina-xl" },
  { title: "New Arrivals", href: "/collections/new-arrivals" },
] as const;

const animalCategories = [
  { title: "Bears", href: "/collections/bears", image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-bear.jpg?v=1793843383" },
  { title: "Bunnies", href: "/collections/bunnies", image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-bunny.jpg?v=1793843383" },
  { title: "Cats", href: "/collections/cats", image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-cat.jpg?v=1793843383" },
  { title: "Cute Characters", href: "/collections/characters", image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-dinosaur.jpg?v=1793843384" },
  { title: "Pandas", href: "/collections/pandas", image: "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-12.png?v=1793843385" },
  { title: "Penguins", href: "/collections/penguins", image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-penguin.jpg?v=1793843384" },
];

const ticker = [
  { text: "NEW: DOMINA GIANT PLUSH UP TO 120 CM", href: "/pages/domina-xl" },
  { text: "JOIN RARE DROP ALERTS AND BE FIRST TO KNOW", href: "/#drops" },
  { text: "RARE & LIMITED PLUSH, HAND-PICKED FOR YOU", href: "/collections/rare-finds" },
];

function JellyfishMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true"><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="var(--color-accent,#a2502f)"/><circle cx="26" cy="23" r="2.6" fill="#3f302b"/><circle cx="38" cy="23" r="2.6" fill="#3f302b"/><path d="M22 29c1.4 1.6 3 1.6 4.4 0" fill="none" stroke="#3f302b" strokeWidth="2" strokeLinecap="round"/><path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" fill="none" stroke="var(--color-accent,#a2502f)" strokeWidth="3" strokeLinecap="round"/></svg>;
}

function SearchGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function BagGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>;
}
function HeartGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}
function PersonGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 20c1.5-4 4-6 7.5-6s6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function useWishlistCount() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener("ponyo:wishlist-updated", callback);
      document.addEventListener("ponyo:wishlist-change", callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener("ponyo:wishlist-updated", callback);
        document.removeEventListener("ponyo:wishlist-change", callback);
      };
    },
    () => {
      try {
        const saved = JSON.parse(localStorage.getItem("ponyo:wishlist") ?? localStorage.getItem("ponyo-wishlist-v1") ?? "[]") as string[];
        return Array.isArray(saved) ? saved.length : 0;
      } catch { return 0; }
    },
    () => 0,
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const localCart = useCartItems();
  const cart = localCart;
  const headerRef = useRef<HTMLElement>(null);
  const categorySlotRef = useRef<HTMLDivElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"root" | "collectibles">("root");
  const [smartHeaderVisible, setSmartHeaderVisible] = useState(false);
  const [categoryPinned, setCategoryPinned] = useState(false);
  const [categoryHeight, setCategoryHeight] = useState(0);
  const wishlistCount = useWishlistCount();
  const [bagOpen, setBagOpen] = useState(false);
  const itemCount = cart.reduce((total, item) => total + item.qty, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.qty, 0);
  const accountUrl = "/account";

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const header = headerRef.current;
      const slot = categorySlotRef.current;
      const headerBottom = header ? header.offsetTop + header.offsetHeight : 0;
      setSmartHeaderVisible((visible) => {
        if (y <= headerBottom) return false;
        if (y < lastY - 6) return true;
        if (y > lastY + 6) return false;
        return visible;
      });
      const shouldPin = Boolean(window.matchMedia("(min-width: 768px)").matches && slot && y > slot.getBoundingClientRect().top + y);
      if (shouldPin !== categoryPinned) {
        setCategoryPinned(shouldPin);
        if (shouldPin && slot) setCategoryHeight(slot.firstElementChild?.getBoundingClientRect().height ?? 0);
      }
      lastY = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [categoryPinned]);

  useEffect(() => {
    const dialog = menuDialog.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);

  useEffect(() => {
    const dialog = cartDialog.current;
    if (!dialog) return;
    if (bagOpen && !dialog.open) dialog.showModal();
    if (!bagOpen && dialog.open) dialog.close();
  }, [bagOpen]);

  useEffect(() => {
    const handler = () => setBagOpen(true);
    window.addEventListener("ponyo:cart-open", handler);
    return () => window.removeEventListener("ponyo:cart-open", handler);
  }, []);

  function saveQuantity(id: string, quantity: number) {
    const next = cart.map((item) => item.id === id ? { ...item, qty: Math.max(1, quantity) } : item);
    try {
      saveCart(next);
      window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: next }));
    } catch { /* keep the drawer responsive if storage is disabled */ }
  }

  function removeCartItem(id: string) {
    const next = cart.filter((item) => item.id !== id);
    try {
      saveCart(next);
      window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: next }));
    } catch { /* keep the drawer responsive if storage is disabled */ }
  }

  return (
    <>
      <div className="store-announcement" role="region" aria-label="Announcement">
        <Link href="/pages/contact">How can we help you?</Link>
        <p><JellyfishMark /><span>Meet your next forever plush.</span><JellyfishMark /></p>
        <Link href="/pages/faq">Delivery information</Link>
      </div>
      <header className="store-header" id="site-header" ref={headerRef}>
        <div className="store-header-main" data-header-nav-group>
          <button className="store-icon-button menu-toggle" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => { setActiveMenu("root"); setMenuOpen(true); }}><span className="menu-glyph" aria-hidden="true">☰</span></button>
          <div className="store-brand-group">
            <Link href="/" className="store-logo-mark" aria-hidden="true" tabIndex={-1}><JellyfishMark /></Link>
            <Link href="/" className="store-logo" aria-label="Ponyo home">PONYO</Link>
          </div>
          <StoreSearch />
          <div className="store-actions">
            <span className="store-localization"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg><span>EN</span><i>|</i><span>¥ JPY</span></span>
            <Link href="/collections/all?view=wishlist" className="store-icon-button" aria-label={`My Wishlist${wishlistCount ? `, ${wishlistCount} saved` : ""}`}><HeartGlyph />{wishlistCount > 0 && <span className="wishlist-count">{wishlistCount}</span>}</Link>
            <a href={accountUrl} className="store-icon-button" aria-label="Account"><PersonGlyph /></a>
            <button className="store-icon-button bag-button" type="button" aria-label={`Cart (${itemCount} items)`} aria-expanded={bagOpen} onClick={() => setBagOpen(true)}><BagGlyph />{itemCount > 0 && <span className="bag-count">{itemCount}</span>}</button>
          </div>
        </div>
        <div ref={categorySlotRef} className={`store-category-slot${categoryPinned ? " is-pinned" : ""}`} style={categoryPinned ? { height: categoryHeight } : undefined}>
        <div className={`store-category-row${categoryPinned ? " is-pinned" : ""}`} style={categoryPinned ? { top: smartHeaderVisible ? 64 : 0 } : undefined}>
          <nav className="store-navigation" aria-label="Main navigation">
            {mainLinks.map((item) => <Link key={item.title} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.title}</Link>)}
            <details className="desktop-collectibles-menu"><summary>Collectibles <span aria-hidden="true">⌄</span></summary><div className="desktop-collectibles-panel">{animalCategories.slice(1, 5).map((item) => <Link key={item.title} href={item.href}>{item.title}</Link>)}<Link href="/shop?category=penguins">Penguins</Link></div></details>
          </nav>
          <Link href="/pages/domina-xl" className="domina-link"><span>DOMINA by Ponyo</span><span className="domina-promo-copy">· Giant plush from 70 to 120 cm</span><span className="domina-arrow" aria-hidden="true">›</span></Link>
        </div>
        </div>
        <div className="store-ticker" role="region" aria-label="Announcements"><div className="ticker-track">{[0, 1].map((pass) => <div key={pass} className="ticker-set" aria-hidden={pass === 1}>{ticker.map((item) => <span className="ticker-item" key={`${pass}-${item.text}`}><Link href={item.href} tabIndex={pass ? -1 : undefined}>{item.text}</Link><span aria-hidden="true">✦</span></span>)}</div>)}</div></div>
      </header>

      <div className={`smart-header${smartHeaderVisible ? " is-shown" : ""}`} aria-hidden={!smartHeaderVisible} inert={!smartHeaderVisible}>
        <div className="smart-header-inner">
          <button type="button" className="smart-menu-trigger" aria-label="Open menu" onClick={() => { setActiveMenu("root"); setMenuOpen(true); }}>☰</button>
          <Link href="/" className="smart-brand"><span className="store-logo-mark"><JellyfishMark /></span><span>PONYO</span></Link>
          <button type="button" className="smart-search-trigger" aria-label="Search" onClick={() => window.dispatchEvent(new Event("ponyo:open-search"))}>Search bunnies, bears, giant plush...<span><SearchGlyph /></span></button>
          <button type="button" className="smart-cart-trigger" aria-label={`Cart, ${itemCount} items`} onClick={() => setBagOpen(true)}><BagGlyph />{itemCount > 0 && <span>{itemCount}</span>}</button>
        </div>
      </div>

      <dialog ref={menuDialog} className="mobile-menu-dialog" aria-labelledby="mobile-menu-title" onClose={() => setMenuOpen(false)} onClick={(event) => { if (event.target === menuDialog.current) setMenuOpen(false); }}>
        <div className="mobile-menu-sheet">
          <div className="mobile-menu-heading">
            {activeMenu !== "root" && <button type="button" className="mobile-menu-back" onClick={() => setActiveMenu("root")} aria-label="Back to menu">‹ <span>Back</span></button>}
            <strong id="mobile-menu-title">{activeMenu === "root" ? "PONYO" : "Collectibles"}</strong>
            <button type="button" className="mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
          </div>
          <div className="mobile-menu-content">
            {activeMenu === "root" ? <>
              <div className="mobile-account-card"><JellyfishMark /><div><strong>Welcome to Ponyo</strong><span>Find a new forever plush.</span></div><a href={accountUrl}>Sign in</a></div>
              <p className="mobile-menu-label">Shop</p>
              <nav className="mobile-primary-links" aria-label="Shop menu">
                {mainLinks.map((item) => <Link key={item.title} href={item.href} onClick={() => setMenuOpen(false)}>{item.title}<span aria-hidden="true">›</span></Link>)}
                <button type="button" onClick={() => setActiveMenu("collectibles")}>Collectibles<span aria-hidden="true">›</span></button>
              </nav>
              <p className="mobile-menu-label">Shop by type</p>
              <div className="mobile-category-tiles">{animalCategories.map((item) => <Link href={item.href} key={item.title} onClick={() => setMenuOpen(false)}><Image src={item.image} alt="" width={56} height={56} /><span>{item.title}</span></Link>)}</div>
              <Link className="mobile-domina-card" href="/pages/domina-xl" onClick={() => setMenuOpen(false)}><Image src="https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-3.png?v=1793843376" alt="" width={68} height={68} /><span><b>DOMINA by Ponyo</b><small>Giant plush from 70 to 120 cm</small></span><i>›</i></Link>
              <p className="mobile-menu-label">Help</p>
              <nav className="mobile-help-links"><Link href="/collections/all?view=wishlist" onClick={() => setMenuOpen(false)}>♡ My Wishlist{wishlistCount > 0 && <b>{wishlistCount}</b>}</Link><Link href="/blogs/news" onClick={() => setMenuOpen(false)}>The Plush Journal</Link><Link href="/pages/faq" onClick={() => setMenuOpen(false)}>FAQ &amp; Shipping</Link><Link href="/pages/contact" onClick={() => setMenuOpen(false)}>Contact us</Link><Link href="/pages/about" onClick={() => setMenuOpen(false)}>About Ponyo</Link></nav>
            </> : <div className="mobile-submenu-grid">{animalCategories.map((item) => <Link href={item.href} key={item.title} onClick={() => setMenuOpen(false)}><Image src={item.image} alt="" width={40} height={40} />{item.title}<span>›</span></Link>)}</div>}
          </div>
        </div>
      </dialog>

      <nav className="mobile-tab-bar" aria-label="Quick navigation">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}><span className="tab-icon">⌂</span><small>Home</small></Link>
        <button type="button" onClick={() => { setActiveMenu("root"); setMenuOpen(true); }} aria-label="Open categories"><span className="tab-icon">▦</span><small>Categories</small></button>
        <Link href="/collections/premium"><span className="tab-icon">☆</span><small>Top Picks</small></Link>
        <Link href="/collections/new-arrivals"><span className="tab-icon"><JellyfishMark /></span><small>For You</small></Link>
        <a href={accountUrl}><span className="tab-icon"><PersonGlyph /></span><small>Me</small></a>
      </nav>

      <dialog ref={cartDialog} className="cart-drawer" aria-label="Shopping cart" onClose={() => setBagOpen(false)} onClick={(event) => { if (event.target === cartDialog.current) setBagOpen(false); }}>
        <div className="cart-drawer-heading"><div><span className="eyebrow">A little bundle of joy</span><h2>Your cart <span>({itemCount})</span></h2></div><button type="button" className="store-icon-button" aria-label="Close cart" onClick={() => setBagOpen(false)}>×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><span>♡</span><p>Your cart is empty.</p><p>Find a rare, premium or giant plush friend to take home.</p><Link className="shop-button" href="/shop" onClick={() => setBagOpen(false)}>Continue shopping</Link><div className="cart-empty-links"><span>Shop by type</span><Link href="/shop?category=bears">Bears</Link><Link href="/shop?category=bunnies">Bunnies</Link><Link href="/shop?category=new-arrival">New Discoveries</Link><Link href="/shop?category=domina-xl">Domina XL</Link></div></div> : <div className="cart-drawer-items">{cart.map((item) => <div className="cart-drawer-item" key={item.id}><Link href={`/products/${item.slug}`} onClick={() => setBagOpen(false)}><Image src={item.image} alt={item.imageAlt} width={84} height={84} /></Link><div className="cart-drawer-item-info"><span>{item.maker}</span><Link href={`/products/${item.slug}`} onClick={() => setBagOpen(false)}>{item.name}</Link><div className="cart-line-controls"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.qty <= 1} onClick={() => saveQuantity(item.id, item.qty - 1)}>−</button><span>{item.qty}</span><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => saveQuantity(item.id, item.qty + 1)}>+</button><button type="button" className="cart-remove" onClick={() => removeCartItem(item.id)} aria-label={`Remove ${item.name}`}>Remove</button></div></div><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>}
        <div className="cart-drawer-footer"><div><span>Subtotal</span><strong>{formatPrice(subtotal, cart[0]?.currency ?? "JPY")}</strong></div><p>Shipping and discounts calculated at checkout.</p><Link className="shop-button shop-button-orange" href={cart.length ? "/cart" : "/collections/all"} onClick={() => setBagOpen(false)}>{cart.length ? "View cart" : "Continue shopping"}<b>→</b></Link></div>
      </dialog>
    </>
  );
}
