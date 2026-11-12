"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccountDrawer } from "@/components/account/account-drawer";
import { saveCart, useCartItems } from "@/lib/cart";
import { StoreSearch } from "@/components/layout/store-search";
import { DeliveryRegionBanner } from "@/components/layout/delivery-region-banner";
import { LocalizationPicker } from "@/components/layout/localization-picker";
import { useLocalization } from "@/components/layout/localization-provider";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

const mainLinks = [
  { title: "Discover", key: "home.header.discover", href: "/" },
  { title: "Shop All", key: "home.footer.shop_all", href: "/collections/all" },
  { title: "Rare Finds", key: "home.footer.rare", href: "/collections/rare-finds" },
  { title: "Premium Plushies", key: "home.footer.premium", href: "/collections/premium" },
  { title: "XL Goodies", key: "home.footer.domina", href: "/collections/domina-xl" },
  { title: "New Arrivals", key: "home.footer.new", href: "/collections/new-arrivals" },
] as const;

const animalCategories = [
  { title: "Bears", href: "/collections/bears", image: "/images/catalog/maker-bear.jpg" },
  { title: "Bunnies", href: "/collections/bunnies", image: "/images/catalog/maker-bunny.jpg" },
  { title: "Cats", href: "/collections/cats", image: "/images/catalog/maker-cat.jpg" },
  { title: "Cute Characters", href: "/collections/characters", image: "/images/catalog/maker-dinosaur.jpg" },
  { title: "Pandas", href: "/collections/pandas", image: "/images/catalog/ponyo-12.png" },
  { title: "Penguins", href: "/collections/penguins", image: "/images/catalog/maker-penguin.jpg" },
];

const collectibleCategories = animalCategories;

function DesktopCollectiblesMenu() {
  const { t } = useLocalization();
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <details
      ref={menu}
      className="desktop-collectibles-menu"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") event.currentTarget.open = true; }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") event.currentTarget.open = false; }}
      onFocusCapture={(event) => { event.currentTarget.open = true; }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.querySelector("summary")?.focus();
          event.currentTarget.open = false;
        }
      }}
    >
      <summary>{t("home.header.collectibles", "Collectibles")}</summary>
      <div className="desktop-collectibles-panel">
        {collectibleCategories.map((item) => <Link key={item.title} href={item.href} onClick={() => { if (menu.current) menu.current.open = false; }}>
          <Image src={item.image} alt="" width={44} height={44} />
          <span>{t(`home.categories.${item.title === "Cute Characters" ? "characters" : item.title.toLowerCase()}`, item.title)}</span>
          <span className="desktop-collectibles-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>
    </details>
  );
}

const ticker = [
  { text: "NEW: DOMINA GIANT PLUSH UP TO 120 CM", key: "home.announce_2", href: "/pages/domina-xl" },
  { text: "JOIN RARE DROP ALERTS AND BE FIRST TO KNOW", key: "home.announce_3", href: "/#drops" },
  { text: "RARE & LIMITED PLUSH, HAND-PICKED FOR YOU", key: "home.announce_4", href: "/collections/rare-finds" },
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
function TrashGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9 7V4.8h6V7m2.8 0-.8 13H7L6.2 7m3.3 3.2v6.2m4.9-6.2v6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function CartDrawerImage({ src, alt }: { src: string; alt: string }) {
  const [imageSource, setImageSource] = useState(src);
  return <img src={imageSource} alt={alt} // eslint-disable-line @next/next/no-img-element
    onError={() => { if (imageSource !== "/images/plushies-home-2.png") setImageSource("/images/plushies-home-2.png"); }} />;
}
function HeartGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}
function PersonGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 20c1.5-4 4-6 7.5-6s6 2 7.5 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function CategoryGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c2.1 0 3.2 2.4 1.8 4.1L12 9.5l-1.8-2.2C8.8 5.6 9.9 3.2 12 3.2ZM20.8 12c0 2.1-2.4 3.2-4.1 1.8L14.5 12l2.2-1.8c1.7-1.4 4.1-.3 4.1 1.8ZM12 20.8c-2.1 0-3.2-2.4-1.8-4.1L12 14.5l1.8 2.2c1.4 1.7.3 4.1-1.8 4.1ZM3.2 12c0-2.1 2.4-3.2 4.1-1.8l2.2 1.8-2.2 1.8C5.6 15.2 3.2 14.1 3.2 12Z" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="#fffaf6"/></svg>;
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
  const { t, formatPrice } = useLocalization();
  const { customer } = useCustomerSession();
  const localCart = useCartItems();
  const cart = localCart;
  const headerRef = useRef<HTMLElement>(null);
  const categorySlotRef = useRef<HTMLDivElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const cartDialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"root" | "collectibles">("root");
  const [smartHeaderVisible, setSmartHeaderVisible] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [categoryPinned, setCategoryPinned] = useState(false);
  const [categoryHeight, setCategoryHeight] = useState(0);
  const wishlistCount = useWishlistCount();
  const [bagOpen, setBagOpen] = useState(false);
  const itemCount = cart.reduce((total, item) => total + item.qty, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.qty, 0);
  const isTopPicksRoute = pathname.startsWith("/collections/premium");
  const isForYouRoute = pathname.startsWith("/collections/new-arrivals");
  const isCategoryRoute = pathname === "/collections" || pathname === "/shop" || pathname.startsWith("/shop?") || (pathname.startsWith("/collections/") && !isTopPicksRoute && !isForYouRoute);
  const pinCompactHeader = pathname !== "/";
  const pinCompactMobileHeader = pinCompactHeader && isMobileViewport;

  useEffect(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousScrollBehavior;
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const header = headerRef.current;
      const slot = categorySlotRef.current;
      const compactStart = slot ? slot.getBoundingClientRect().top + y : (header?.offsetTop ?? 0) + (header?.offsetHeight ?? 0);
      setSmartHeaderVisible(y > compactStart);
      const shouldPin = Boolean(window.matchMedia("(min-width: 768px)").matches && slot && y > compactStart);
      if (shouldPin !== categoryPinned) {
        setCategoryPinned(shouldPin);
        if (shouldPin && slot) setCategoryHeight(slot.firstElementChild?.getBoundingClientRect().height ?? 0);
      }
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
    const next = cart.map((item) => item.id === id ? { ...item, qty: Math.min(99, Math.max(1, Math.floor(quantity))) } : item);
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

  function openAccountDrawer() {
    window.dispatchEvent(new Event("ponyo:account-open"));
  }

  function openAccountFromMenu() {
    setMenuOpen(false);
    window.setTimeout(openAccountDrawer, 0);
  }

  return (
    <>
      <div className="store-announcement" role="region" aria-label={t("home.announce_label", "Announcement")}>
        <Link href="/pages/contact">{t("home.header.help", "How can we help you?")}</Link>
        <p><JellyfishMark /><span>{t("home.announcement", "Meet your next forever plush.")}</span><JellyfishMark /></p>
        <Link href="/pages/faq">{t("home.header.delivery", "Delivery information")}</Link>
      </div>
      <header className={`store-header${pathname !== "/" ? " is-mobile-sticky" : ""}`} id="site-header" ref={headerRef}>
        <div className="store-header-main" data-header-nav-group>
          <button className="store-icon-button menu-toggle" type="button" aria-label={t("header.menu", "Open menu")} aria-expanded={menuOpen} onClick={() => { setActiveMenu("root"); setMenuOpen(true); }}><span className="menu-glyph" aria-hidden="true">☰</span></button>
          <div className="store-brand-group">
            <Link href="/" className="store-logo-mark" aria-hidden="true" tabIndex={-1}><JellyfishMark /></Link>
            <Link href="/" className="store-logo" aria-label={t("home.header.home", "Ponyo home")}>PONYO</Link>
          </div>
          <StoreSearch />
          <div className="store-actions">
            <LocalizationPicker />
            <Link href="/collections/all?view=wishlist" className="store-icon-button" aria-label={t("home.header.wishlist", `My Wishlist${wishlistCount ? `, ${wishlistCount} saved` : ""}`, { count: wishlistCount })}><HeartGlyph />{wishlistCount > 0 && <span className="wishlist-count">{wishlistCount}</span>}</Link>
            <button type="button" className="store-icon-button account-icon-trigger" aria-label={t("home.header.profile", "My profile")} title={t("home.header.profile", "My profile")} onClick={openAccountDrawer}><PersonGlyph /></button>
            <button className="store-icon-button bag-button" type="button" aria-label={t("home.header.cart", `Cart (${itemCount} items)`, { count: itemCount })} aria-expanded={bagOpen} onClick={() => setBagOpen(true)}><BagGlyph />{itemCount > 0 && <span className="bag-count">{itemCount}</span>}</button>
          </div>
        </div>
        <div ref={categorySlotRef} className={`store-category-slot${categoryPinned ? " is-pinned" : ""}`} style={categoryPinned ? { height: categoryHeight } : undefined}>
        <div className={`store-category-row${categoryPinned ? " is-pinned" : ""}`} style={categoryPinned ? { top: smartHeaderVisible ? 64 : 0 } : undefined}>
          <nav className="store-navigation" aria-label="Main navigation">
            {mainLinks.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{t(item.key, item.title)}</Link>)}
            <DesktopCollectiblesMenu />
          </nav>
          <Link href="/pages/domina-xl" className="domina-link"><span>DOMINA by Ponyo</span><span className="domina-promo-copy">· {t("home.header.giant_plush_range", "Giant plush from 70 to 120 cm")}</span><span className="domina-arrow" aria-hidden="true">›</span></Link>
        </div>
        </div>
        <div className="store-ticker" role="region" aria-label={t("home.announce_label", "Announcements")}><div className="ticker-track">{[0, 1].map((pass) => <div key={pass} className="ticker-set" aria-hidden={pass === 1}>{ticker.map((item) => <span className="ticker-item" key={`${pass}-${item.text}`}><Link href={item.href} tabIndex={pass ? -1 : undefined}>{t(item.key, item.text)}</Link><span aria-hidden="true">✦</span></span>)}</div>)}</div></div>
        {pathname === "/" && <DeliveryRegionBanner />}
      </header>

      <div className={`smart-header${smartHeaderVisible || pinCompactHeader ? " is-shown" : ""}${pinCompactMobileHeader ? " is-mobile-pinned" : ""}`} aria-hidden={!smartHeaderVisible && !pinCompactHeader} inert={!smartHeaderVisible && !pinCompactHeader}>
        <div className="smart-header-inner">
          <button type="button" className="smart-menu-trigger" aria-label={t("header.menu", "Open menu")} onClick={() => { setActiveMenu("root"); setMenuOpen(true); }}>☰</button>
          <Link href="/" className="smart-brand" aria-label={t("home.header.home", "Ponyo home")}><span className="smart-brand-mark"><JellyfishMark /></span><span>PONYO</span></Link>
          <div className="smart-header-search"><StoreSearch compactHeader /></div>
          <button type="button" className="smart-search-trigger" aria-label={t("home.header.search_placeholder", "Search Ponyo")} onClick={() => window.dispatchEvent(new Event("ponyo:open-search"))}><span className="smart-search-mobile-label">{t("home.header.search_placeholder", "Search something lovely...")}</span><span className="smart-search-desktop-label">{t("home.header.search_placeholder", "Search bunnies, bears, giant plush...")}</span><span className="smart-search-icon"><SearchGlyph /></span></button>
          <div className="smart-header-actions">
            <LocalizationPicker compact />
            <Link href="/collections/all?view=wishlist" className="smart-icon-trigger" aria-label={t("home.header.wishlist", `My Wishlist${wishlistCount ? `, ${wishlistCount} saved` : ""}`, { count: wishlistCount })}><HeartGlyph />{wishlistCount > 0 && <span>{wishlistCount}</span>}</Link>
            <button type="button" className="smart-icon-trigger smart-profile-trigger" aria-label={t("home.header.profile", "My profile")} title={t("home.header.profile", "My profile")} onClick={openAccountDrawer}><PersonGlyph /></button>
            <button type="button" className="smart-icon-trigger smart-cart-trigger" aria-label={t("home.header.cart", `Cart (${itemCount} items)`, { count: itemCount })} onClick={() => setBagOpen(true)}><BagGlyph />{itemCount > 0 && <span>{itemCount}</span>}</button>
          </div>
        </div>
        <div className="smart-header-category">
          <nav aria-label="Sticky main navigation">
            {mainLinks.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{t(item.key, item.title)}</Link>)}
            <DesktopCollectiblesMenu />
          </nav>
          <Link href="/pages/domina-xl" className="smart-domina-link">{t("home.header.domina", "DOMINA by Ponyo")}</Link>
        </div>
      </div>

      <dialog ref={menuDialog} className="mobile-menu-dialog" aria-labelledby="mobile-menu-title" onClose={() => setMenuOpen(false)} onClick={(event) => { if (event.target === menuDialog.current) setMenuOpen(false); }}>
        <div className="mobile-menu-sheet">
          <div className="mobile-menu-heading">
            {activeMenu !== "root" && <button type="button" className="mobile-menu-back" onClick={() => setActiveMenu("root")} aria-label={t("general.back", "Back")}>‹ <span>{t("general.back", "Back")}</span></button>}
            <strong id="mobile-menu-title">{activeMenu === "root" ? "PONYO" : t("home.header.collectibles", "Collectibles")}</strong>
            <button type="button" className="mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label={t("general.close", "Close")}>×</button>
          </div>
          <div className="mobile-menu-content">
            {activeMenu === "root" ? <>
              <div className="mobile-account-card"><JellyfishMark /><div><strong>{customer ? t("home.header.welcome_back", `Welcome back, ${customer.firstName || "plush friend"}`, { name: customer.firstName || "" }) : t("home.header.welcome", "Welcome to Ponyo")}</strong><span>{customer?.email ?? t("home.header.find_friend", "Find a new forever plush.")}</span></div><button type="button" onClick={openAccountFromMenu}>{customer ? t("home.header.profile", "My profile") : t("home.header.sign_in", "Sign in")}</button></div>
              <p className="mobile-menu-label">{t("home.footer.shop", "Shop")}</p>
              <nav className="mobile-primary-links" aria-label="Shop menu">
                {mainLinks.map((item) => <Link key={item.title} href={item.href} onClick={() => setMenuOpen(false)}>{t(item.key, item.title)}<span aria-hidden="true">›</span></Link>)}
                <button type="button" onClick={() => setActiveMenu("collectibles")}>{t("home.header.collectibles", "Collectibles")}<span aria-hidden="true">›</span></button>
              </nav>
              <p className="mobile-menu-label">{t("home.header.shop_by_type", "Shop by type")}</p>
              <div className="mobile-category-tiles">{animalCategories.map((item) => <Link href={item.href} key={item.title} onClick={() => setMenuOpen(false)}><Image src={item.image} alt="" width={56} height={56} /><span>{t(`home.categories.${item.title === "Cute Characters" ? "characters" : item.title.toLowerCase()}`, item.title)}</span></Link>)}</div>
              <Link className="mobile-domina-card" href="/pages/domina-xl" onClick={() => setMenuOpen(false)}><Image src="/images/catalog/ponyo-3.png" alt="" width={68} height={68} /><span><b>{t("home.header.domina", "DOMINA by Ponyo")}</b><small>{t("home.header.giant_plush_range", "Giant plush from 70 to 120 cm")}</small></span><i>›</i></Link>
              <p className="mobile-menu-label">{t("home.footer.support", "Help")}</p>
              <nav className="mobile-help-links"><button type="button" onClick={() => { setMenuOpen(false); setBagOpen(true); }}><span>{t("cart.title", "Your cart")}</span><span className="mobile-help-link-meta">{itemCount > 0 && <b>{itemCount}</b>}<i aria-hidden="true">›</i></span></button><Link href="/collections/all?view=wishlist" onClick={() => setMenuOpen(false)}><span>♡ {t("home.header.wishlist", "My Wishlist")}</span>{wishlistCount > 0 && <b>{wishlistCount}</b>}</Link><Link href="/blogs/news" onClick={() => setMenuOpen(false)}>{t("home.footer.journal", "The Plush Journal")}</Link><Link href="/pages/faq" onClick={() => setMenuOpen(false)}>{t("home.footer.faq", "FAQ & Shipping")}</Link><Link href="/pages/contact" onClick={() => setMenuOpen(false)}>{t("home.footer.contact", "Contact us")}</Link><Link href="/pages/about" onClick={() => setMenuOpen(false)}>{t("home.footer.about_link", "About Ponyo")}</Link></nav>
            </> : <div className="mobile-submenu-grid">{animalCategories.map((item) => <Link href={item.href} key={item.title} onClick={() => setMenuOpen(false)}><Image src={item.image} alt="" width={40} height={40} />{item.title}<span>›</span></Link>)}</div>}
          </div>
        </div>
      </dialog>

      <nav className="mobile-tab-bar" aria-label={t("tabbar.label", "Quick navigation")}>
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}><span className="tab-icon">⌂</span><small>{t("tabbar.home", "Home")}</small></Link>
        <Link href="/collections" className={isCategoryRoute ? "is-current" : ""} aria-current={isCategoryRoute ? "page" : undefined} aria-label={t("tabbar.categories", "Browse categories")}><span className="tab-icon"><CategoryGlyph /></span><small>{t("tabbar.categories", "Categories")}</small></Link>
        <button type="button" className="mobile-cart-tab" aria-current={pathname === "/cart" || pathname === "/checkout" ? "page" : undefined} aria-label={t("home.header.open_cart", `Open cart, ${itemCount} items`, { count: itemCount })} onClick={() => setBagOpen(true)}><span className="tab-icon"><BagGlyph />{itemCount > 0 && <b className="mobile-cart-tab-count">{itemCount}</b>}</span><small>{t("cart.title", "Cart")}</small></button>
        <Link href="/collections/new-arrivals" aria-current={isForYouRoute ? "page" : undefined}><span className="tab-icon"><JellyfishMark className="mobile-tab-jellyfish" /></span><small>{t("tabbar.for_you", "For You")}</small></Link>
        <button type="button" className="mobile-account-tab" aria-current={pathname.startsWith("/account") || pathname === "/orders" ? "page" : undefined} onClick={openAccountDrawer} aria-label={t("home.header.open_account", "Open my account")}><span className="tab-icon"><PersonGlyph /></span><small>{t("tabbar.me", "Me")}</small></button>
      </nav>

      <AccountDrawer />

      <dialog ref={cartDialog} className="cart-drawer" aria-label={t("cart.title", "Shopping cart")} onClose={() => setBagOpen(false)} onClick={(event) => { if (event.target === cartDialog.current) setBagOpen(false); }}>
        <div className="cart-drawer-heading"><div><span className="eyebrow">{t("home.cart.kicker", "A little bundle of joy")}</span><h2>{t("cart.title", "Your cart")} <span>({itemCount})</span></h2></div><button type="button" className="store-icon-button" aria-label={t("general.close", "Close cart")} onClick={() => setBagOpen(false)}>×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><span>♡</span><p>{t("cart.empty", "Your cart is empty.")}</p><p>{t("home.cart.empty_body", "Find a rare, premium or giant plush friend to take home.")}</p><Link className="shop-button" href="/shop" onClick={() => setBagOpen(false)}>{t("cart.continue_shopping", "Continue shopping")}</Link><div className="cart-empty-links"><span>{t("home.cart.popular", "Shop by type")}</span><Link href="/shop?category=bears">{t("home.categories.bears", "Bears")}</Link><Link href="/shop?category=bunnies">{t("home.categories.bunnies", "Bunnies")}</Link><Link href="/shop?category=new-arrival">{t("home.carousel.new.title", "New Discoveries")}</Link><Link href="/shop?category=domina-xl">{t("home.footer.domina", "Domina XL")}</Link></div></div> : <div className="cart-drawer-items">{cart.map((item) => {const itemName = t(`product.names.${item.slug}`, item.name); return <div className="cart-drawer-item" key={item.id}>{item.catalogId ? <Link className="cart-drawer-item-image" href={`/products/${item.catalogId}`} onClick={() => setBagOpen(false)}><CartDrawerImage src={item.image} alt={item.imageAlt} /></Link> : <span className="cart-drawer-item-image"><CartDrawerImage src={item.image} alt={item.imageAlt} /></span>}<div className="cart-drawer-item-info"><span>{item.maker}</span>{item.catalogId ? <Link href={`/products/${item.catalogId}`} onClick={() => setBagOpen(false)}>{itemName}</Link> : <span className="cart-drawer-item-title">{itemName}</span>}<strong className="cart-drawer-item-price">{formatPrice(item.price, item.currency)} <small>{t("cart.each", "each")}</small></strong><div className="cart-drawer-item-actions"><div className="cart-line-controls"><button type="button" aria-label={t("cart.decrease_item", `Decrease ${itemName} quantity`, { title: itemName })} disabled={item.qty <= 1} onClick={() => saveQuantity(item.id, item.qty - 1)}>−</button><span>{item.qty}</span><button type="button" aria-label={t("cart.increase_item", `Increase ${itemName} quantity`, { title: itemName })} onClick={() => saveQuantity(item.id, item.qty + 1)}>+</button></div><button type="button" className="cart-remove" onClick={() => removeCartItem(item.id)} aria-label={t("cart.remove", `Remove ${itemName}`, { title: itemName })} title={t("cart.remove_item", "Remove item")}><TrashGlyph /><span>{t("cart.remove_item", "Remove")}</span></button></div></div><b className="cart-drawer-item-total">{formatPrice(item.price * item.qty, item.currency)}</b></div>;})}</div>}
        <div className="cart-drawer-footer"><div><span>{t("cart.subtotal", "Subtotal")}</span><strong>{formatPrice(subtotal, cart[0]?.currency ?? "JPY")}</strong></div><p>{t("cart.taxes_and_shipping_at_checkout", "Shipping and taxes are calculated at checkout.")}</p><Link className="shop-button shop-button-orange" href={cart.length ? "/cart" : "/collections/all"} onClick={() => setBagOpen(false)}>{cart.length ? t("cart.view_cart", "View cart") : t("cart.continue_shopping", "Continue shopping")}<b>→</b></Link></div>
      </dialog>
    </>
  );
}
