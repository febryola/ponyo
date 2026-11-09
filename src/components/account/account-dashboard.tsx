"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL, type CustomerProfile } from "@/services/ponyo-api.client";

type ViewState = "loading" | "guest" | "signed-in";

export function AccountDashboard() {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [view, setView] = useState<ViewState>(PONYO_API_BASE_URL ? "loading" : "guest");
  const [editProfile, setEditProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState(PONYO_API_BASE_URL ? "" : "Connect the Ponyo API to access your saved account details.");
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe().then((profile) => {
      if (!active) return;
      setCustomer(profile);
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setView("signed-in");
      ponyoApi.getOrders().then((orders) => {
        if (active) setOrdersCount(orders.length);
      }).catch(() => {
        if (active) setOrdersCount(null);
      });
    }).catch((error: unknown) => {
      if (!active) return;
      setView("guest");
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        setErrorMessage(error instanceof Error ? error.message : "We couldn't check your Ponyo account.");
      }
    });
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    try {
      const updated = await ponyoApi.updateMe({ firstName: firstName.trim(), lastName: lastName.trim() });
      setCustomer(updated);
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
      setCustomer(null);
      setView("guest");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setIsSigningOut(false);
    }
  }

  if (view === "loading") {
    return <section className="account-loading" role="status"><Image src="/ponyo-jellyfish.svg" alt="" width={52} height={52} /><p>Finding your little corner of Ponyo…</p></section>;
  }

  if (view === "guest" || !customer) {
    return <div className="account-guest-wrap">
      <div className="account-guest-doodle" aria-hidden="true"><span>🐚</span><Image src="/ponyo-jellyfish.svg" alt="" width={52} height={52} /><span>♡</span></div>
      {errorMessage && <p className="account-service-note" role="status">{errorMessage}</p>}
      <AccountAuthForm mode="login" onAuthenticated={(profile) => {
        setCustomer(profile);
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setView("signed-in");
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
        <Link className="account-overview-tile account-orders-tile" href="/orders"><span className="account-tile-art" aria-hidden="true">📦</span><span className="account-hub-kicker">YOUR LITTLE PARCELS</span><strong>Order history</strong><small>{ordersCount === null ? "See your latest order updates" : `${ordersCount} ${ordersCount === 1 ? "order" : "orders"} so far`}</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        <Link className="account-overview-tile account-address-tile" href="/account/addresses"><span className="account-tile-art" aria-hidden="true">🏡</span><span className="account-hub-kicker">READY FOR DELIVERY</span><strong>Saved addresses</strong><small>Make checkout extra easy</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
        <Link className="account-overview-tile account-wishlist-tile" href="/wishlist"><span className="account-tile-art" aria-hidden="true">💌</span><span className="account-hub-kicker">YOUR WISH LIST</span><strong>Saved plushies</strong><small>All the cuties you love</small><span className="account-tile-arrow" aria-hidden="true">→</span></Link>
      </section>
    </div>

    <footer className="account-hub-footer"><p><Image src="/ponyo-jellyfish.svg" alt="" width={18} height={18} /> Need a hand? <Link href="/pages/contact">Ponyo’s here to help.</Link></p><button className="account-signout-button" type="button" onClick={() => void signOut()} disabled={isSigningOut}>{isSigningOut ? "Signing out…" : "Sign out"}</button></footer>
  </section>;
}
