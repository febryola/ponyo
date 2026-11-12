"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { addCartItem, readCart, saveCart, type CartItem } from "@/lib/cart";
import { ponyoApi, PONYO_API_BASE_URL, type BackendOrder } from "@/services/ponyo-api.client";
import { refreshCartItems } from "@/lib/cart-validation";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { useLocalization } from "@/components/layout/localization-provider";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

type ViewState = "loading" | "guest" | "signed-in";

export function AccountDashboard() {
  const router = useRouter();
  const { t } = useLocalization();
  const { customer, isLoading: isSessionLoading, setCustomer: setSessionCustomer } = useCustomerSession();
  const view: ViewState = isSessionLoading ? "loading" : customer ? "signed-in" : "guest";
  const [editProfile, setEditProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const [recentOrder, setRecentOrder] = useState<BackendOrder | null>(null);
  const [reorderMessage, setReorderMessage] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [errorMessage, setErrorMessage] = useState(PONYO_API_BASE_URL ? "" : "Connect the Ponyo API to access your saved account details.");
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isSessionLoading || !customer || !PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getOrders().then((orders) => {
      if (active) {
        setOrdersCount(orders.length);
        setRecentOrder([...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null);
      }
    }).catch(() => {
        if (active) {
          setOrdersCount(null);
          setRecentOrder(null);
        }
    });
    return () => { active = false; };
  }, [customer, isSessionLoading]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    try {
      const updated = await ponyoApi.updateMe({ firstName: firstName.trim(), lastName: lastName.trim() });
      setSessionCustomer(updated);
      setEditProfile(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function signOut() {
    setErrorMessage("");
    setIsSigningOut(true);
    try {
      await ponyoApi.logout();
      setSessionCustomer(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setIsSigningOut(false);
    }
  }

  async function buyAgain() {
    if (!recentOrder) return;
    setIsReordering(true);
    setReorderMessage("");
    try {
      const historicalLines = recentOrder.items.filter((item) => item.variantId && item.quantity > 0);
      if (!historicalLines.length) {
        setReorderMessage(t("account.reorder_unavailable", "This order does not have items available for quick reorder. Contact Ponyo for help."));
        return;
      }
      const currency = historicalLines[0].currency || recentOrder.currency;
      const proposed: CartItem[] = historicalLines.map((item) => ({
        id: item.variantId!,
        catalogId: item.productId ?? undefined,
        variantId: item.variantId!,
        slug: item.productId ?? item.variantId!,
        name: item.name,
        maker: item.maker ?? "Ponyo",
        price: item.unitPrice,
        currency: item.currency || currency,
        image: item.image || "/images/catalog/ponyo-2.png",
        imageAlt: item.imageAlt || item.name,
        qty: item.quantity,
      }));
      const checked = await refreshCartItems(proposed, currency);
      const unavailable = checked.items.some((item) => item.availability !== "available" || item.validationIssue || !item.variantId);
      if (!checked.validation || !checked.validation.canCheckout || unavailable || checked.validation.items.some((line) => line.priceChanged)) {
        setReorderMessage(t("account.reorder_review", "Some items are unavailable or their prices changed. Review your order before adding anything to your cart."));
        return;
      }
      const currentCart = readCart();
      const requestedByVariant = new Map<string, number>();
      for (const item of checked.items) {
        const variantId = item.variantId!;
        requestedByVariant.set(variantId, (requestedByVariant.get(variantId) ?? 0) + item.qty);
      }
      const currentByVariant = new Map(currentCart.filter((item) => item.variantId).map((item) => [item.variantId!, item.qty]));
      if ([...requestedByVariant].some(([variantId, quantity]) => quantity + (currentByVariant.get(variantId) ?? 0) > 99) ||
        new Set([...currentByVariant.keys(), ...requestedByVariant.keys()]).size > 100) {
        setReorderMessage(t("account.reorder_cart_full", "Your cart is full. Remove an item before adding this order."));
        return;
      }
      const merged = checked.items.reduce((cart, item) => addCartItem(cart, item), currentCart);
      saveCart(merged);
      router.push("/cart");
    } catch (error) {
      setReorderMessage(error instanceof Error ? error.message : t("account.reorder_error", "We couldn’t check current availability. Please try again or contact Ponyo."));
    } finally {
      setIsReordering(false);
    }
  }

  if (view === "loading" || isSessionLoading) {
    return <section className="account-loading" role="status"><Image src="/ponyo-jellyfish.svg" alt="" width={52} height={52} /><p>Finding your little corner of Ponyo…</p></section>;
  }

  if (view === "guest" || !customer) {
    return <div className="account-guest-wrap">
      <div className="account-guest-doodle" aria-hidden="true"><span>🐚</span><Image src="/ponyo-jellyfish.svg" alt="" width={52} height={52} /><span>♡</span></div>
      {errorMessage && <p className="account-service-note" role="status">{errorMessage}</p>}
      <AccountAuthForm mode="login" onAuthenticated={(profile) => {
        setSessionCustomer(profile);
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
      }} />
    </div>;
  }

  return <section className="account-hub" aria-labelledby="account-hub-title">
    <header className="account-hub-hero">
      <div className="account-hub-hero-copy">
        <span className="account-hub-kicker"><span aria-hidden="true">✦</span> YOUR PONYO PLACE</span>
        <h1 id="account-hub-title">Hello, {customer.firstName || "plush friend"}!</h1>
        <p>Your cozy corner for orders, details, and all things fluffy.</p>
      </div>
      <div className="account-hub-mascot" aria-hidden="true"><span className="account-hub-sparkle">✦</span><Image className="account-hub-jelly" src="/ponyo-jellyfish.svg" alt="" width={76} height={76} /><span className="account-hub-shell">🐚</span><span className="account-hub-sparkle-secondary">✦</span></div>
      <nav className="account-hub-shortcuts" aria-label="Account navigation">
        <Link href="/account" aria-current="page"><span aria-hidden="true">☻</span><strong>My profile</strong></Link>
        <Link href="/orders"><span aria-hidden="true">▤</span><strong>My orders</strong></Link>
        <Link href="/account/addresses"><span aria-hidden="true">⌖</span><strong>Addresses</strong></Link>
        <Link href="/wishlist"><span aria-hidden="true">♡</span><strong>Wishlist</strong></Link>
      </nav>
    </header>

    {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}

    <div className="account-hub-content">
      <section className="account-profile-card" aria-labelledby="profile-details-title">
        <header className="account-section-heading"><div><span className="account-section-icon"><Image src="/ponyo-jellyfish.svg" alt="" width={27} height={27} /></span><span><span className="account-hub-kicker">A LITTLE ABOUT YOU</span><h2 id="profile-details-title">Profile details</h2></span></div>
          {!editProfile && <button className="account-text-button" type="button" onClick={() => setEditProfile(true)}>Edit details <span aria-hidden="true">↗</span></button>}
        </header>
        {editProfile ? <form className="account-profile-form" onSubmit={saveProfile}>
          <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required maxLength={120} /></label>
          <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={120} /></label>
          <label>Email address<input value={customer.email} readOnly aria-describedby="email-readonly-note" /><small id="email-readonly-note">Your email is your sign-in and can’t be changed here.</small></label>
          <div className="account-form-actions"><button className="account-primary-button" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save my details"}<span aria-hidden="true">♡</span></button><button className="account-quiet-button" type="button" onClick={() => { setEditProfile(false); setFirstName(customer.firstName); setLastName(customer.lastName); }}>Cancel</button></div>
        </form> : <dl className="account-profile-details"><div><dt>Name</dt><dd>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Plush friend"}</dd></div><div><dt>Email</dt><dd>{customer.email}</dd></div><div><dt>Account</dt><dd><span className="account-verified-dot" />Connected to Ponyo</dd></div></dl>}
      </section>

      <section className="account-overview-grid" aria-label="Your account shortcuts">
        <Link className="account-overview-tile account-orders-tile" href="/orders"><span className="account-tile-art" aria-hidden="true">📦</span><span className="account-hub-kicker">{t("account.orders_kicker", "YOUR LITTLE PARCELS")}</span><strong>{t("account.orders_title", "Orders & tracking")}</strong><small>{ordersCount === null ? t("account.orders_unavailable", "See your latest order updates") : t(ordersCount === 1 ? "account.order_count_one" : "account.order_count_many", ordersCount === 1 ? "1 order so far" : "{{count}} orders so far", { count: ordersCount })}</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        <Link className="account-overview-tile account-address-tile" href="/account/addresses"><span className="account-tile-art" aria-hidden="true">🏡</span><span className="account-hub-kicker">READY FOR DELIVERY</span><strong>Saved addresses</strong><small>Make checkout extra easy</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        <Link className="account-overview-tile account-wishlist-tile" href="/wishlist"><span className="account-tile-art" aria-hidden="true">💌</span><span className="account-hub-kicker">YOUR WISH LIST</span><strong>Saved plushies</strong><small>All the cuties you love</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        {recentOrder && <article className="account-overview-tile account-buy-again-tile"><span className="account-tile-art" aria-hidden="true">↻</span><span className="account-hub-kicker">{t("account.reorder_kicker", "A FAVORITE FROM YOUR ORDER")}</span><strong>{t("account.reorder_title", "Buy again")}</strong><small>{t("account.reorder_body", "Add items from your latest order at today’s verified prices")}</small><button type="button" className="account-tile-action" onClick={() => void buyAgain()} disabled={isReordering}>{isReordering ? t("account.reorder_checking", "Checking availability…") : t("account.reorder_button", "Add to cart")}</button><span className="account-tile-arrow" aria-hidden="true">→</span></article>}
        <Link className="account-overview-tile account-shop-again-tile" href="/collections/all"><span className="account-tile-art" aria-hidden="true">✦</span><span className="account-hub-kicker">{t("account.shop_kicker", "A LITTLE SOMETHING NEW")}</span><strong>{t("account.shop_title", "Shop again")}</strong><small>{t("account.shop_body", "Find your next favorite plush")}</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        <Link className="account-overview-tile account-returns-tile" href="/pages/contact"><span className="account-tile-art" aria-hidden="true">♡</span><span className="account-hub-kicker">{t("account.help_kicker", "HERE FOR YOU")}</span><strong>{t("account.returns_title", "Returns & order help")}</strong><small>{t("account.returns_body", "Contact Ponyo about a return or order issue")}</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
      </section>
      {reorderMessage && <p className="account-reorder-message" role="status">{reorderMessage} <Link href="/pages/contact">{t("account.reorder_contact", "Contact Ponyo")}</Link></p>}
    </div>

    <footer className="account-hub-footer"><p><Image src="/ponyo-jellyfish.svg" alt="" width={18} height={18} /> Need a hand? <Link href="/pages/contact">Ponyo’s here to help.</Link></p><button className="account-signout-button" type="button" onClick={() => void signOut()} disabled={isSigningOut}>{isSigningOut ? "Signing out…" : "Sign out"}</button></footer>
  </section>;
}
