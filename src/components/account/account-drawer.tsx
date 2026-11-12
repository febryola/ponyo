"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerProfile } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

export function AccountDrawer() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const { customer: sessionCustomer, setCustomer: setSessionCustomer } = useCustomerSession();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const openAccount = () => {
      if (sessionCustomer) {
        setOpen(false);
        router.push("/account");
        return;
      }
      setSessionError("");
      setAuthMode(null);
      setCheckingSession(Boolean(PONYO_API_BASE_URL));
      setOpen(true);
    };
    window.addEventListener("ponyo:account-open", openAccount);
    return () => window.removeEventListener("ponyo:account-open", openAccount);
  }, [router, sessionCustomer]);

  useEffect(() => {
    if (!open || !PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe()
      .then((profile) => {
        if (!active) return;
        setCustomer(profile);
        setSessionCustomer(profile);
        setOpen(false);
        router.push("/account");
      })
      .catch(() => {
        if (!active) return;
        // A failed session probe is not useful customer-facing copy; show the
        // sign-in actions and let authentication surface any actionable error.
        setCustomer(null);
        setSessionCustomer(null);
      })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [open, router, setSessionCustomer]);

  async function signOut() {
    setSigningOut(true);
    setSessionError("");
    try {
      await ponyoApi.logout();
      setCustomer(null);
      setSessionCustomer(null);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to sign out right now.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="account-drawer"
      aria-label="Your Ponyo account"
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialogRef.current) setOpen(false); }}
    >
      <header className="account-drawer-heading">
        <div><span className="account-auth-eyebrow">A LITTLE HOME FOR YOUR PLUSH</span><h2>Your Ponyo account</h2></div>
        <button type="button" className="account-drawer-close" aria-label="Close account panel" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="account-drawer-body">
        {!PONYO_API_BASE_URL && <p className="account-drawer-preview-note">Preview mode: connect the Ponyo API to create an account or sign in.</p>}
        {sessionError && <p className="api-form-error" role="alert">{sessionError}</p>}
        {checkingSession && <p className="account-drawer-loading" role="status">Checking your account…</p>}

        {!checkingSession && customer ? <section className="account-drawer-profile account-drawer-profile--signed-in" aria-label="Signed-in account">
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">WELCOME BACK</p><h3>Hello, {customer.firstName || "plush friend"}!</h3><p className="account-drawer-email">{customer.email}</p></div>
        </section> : !checkingSession && !authMode && <section className="account-drawer-profile account-drawer-profile--guest" aria-label="Guest account">
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">A LITTLE HOME FOR YOUR PLUSH</p><h3>Your Ponyo account</h3><p className="account-drawer-email">Sign in to follow orders, save favorites, and find your next forever plush.</p></div>
          <div className="account-drawer-auth-actions">
            <button type="button" className="account-drawer-primary" onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" className="account-drawer-secondary" onClick={() => setAuthMode("register")}>Create account</button>
          </div>
        </section>}

        {authMode && !customer && <section className="account-drawer-auth-panel" aria-label={authMode === "register" ? "Create your account" : "Sign in"}>
          <button type="button" className="account-drawer-back" onClick={() => setAuthMode(null)}>← Account overview</button>
          <AccountAuthForm key={authMode} mode={authMode} presentation="drawer" showDrawerTabs={false} onAuthenticated={(profile) => { setCustomer(profile); setSessionCustomer(profile); setAuthMode(null); setOpen(false); router.push("/account"); }} onClose={() => setOpen(false)} />
        </section>}

        <section className="account-drawer-links" aria-label="Account shortcuts">
          <AccountLinkGroup title="Your orders" links={[
            { label: "Track & manage orders", detail: "Check delivery and order status", href: "/orders", icon: "▤" },
            { label: "Buy again", detail: "Find another plush to love", href: "/collections/all", icon: "↻" },
            { label: "Returns & order help", detail: "We’re here if something isn’t right", href: "/pages/contact", icon: "↩" },
          ]} onNavigate={() => setOpen(false)} />
          <AccountLinkGroup title="Your Ponyo" links={[
            { label: "Saved plush", detail: "Your wishlist favorites", href: "/wishlist", icon: "♡" },
            { label: "Delivery addresses", detail: "Manage where plush goes", href: "/account/addresses", icon: "⌖" },
          ]} onNavigate={() => setOpen(false)} />
          <AccountLinkGroup title="Need a hand?" links={[
            { label: "Shipping rates & policies", detail: "Delivery details and answers", href: "/pages/faq", icon: "◇" },
            { label: "Contact Ponyo", detail: "Talk to our little plush-loving team", href: "/pages/contact", icon: "✉" },
          ]} onNavigate={() => setOpen(false)} />
        </section>

        {customer && <button type="button" className="account-drawer-signout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button>}
      </div>
    </dialog>
  );
}

function AccountLinkGroup({ title, links, onNavigate }: { title: string; links: Array<{ label: string; detail: string; href: string; icon: string }>; onNavigate: () => void }) {
  return <section className="account-drawer-link-group" aria-label={title}>
    <header><h3>{title}</h3>{title === "Your orders" && <Link href="/orders" onClick={onNavigate}>See all</Link>}</header>
    <nav>{links.map((link) => <Link href={link.href} key={link.label} onClick={onNavigate}><span className="account-drawer-link-icon" aria-hidden="true">{link.icon}</span><span className="account-drawer-link-copy"><strong>{link.label}</strong><small>{link.detail}</small></span><span className="account-drawer-link-arrow" aria-hidden="true">›</span></Link>)}</nav>
  </section>;
}
