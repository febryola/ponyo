"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { ponyoApi } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

export function AccountDrawer() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const { customer, isLoading, setCustomer: setSessionCustomer } = useCustomerSession();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open && customer) {
      dialogRef.current?.close();
      router.push("/account");
    }
  }, [customer, open, router]);

  useEffect(() => {
    const openAccount = () => {
      if (customer) {
        setOpen(false);
        router.push("/account");
        return;
      }
      setSessionError("");
      setAuthMode(null);
      setOpen(true);
    };
    window.addEventListener("ponyo:account-open", openAccount);
    return () => window.removeEventListener("ponyo:account-open", openAccount);
  }, [customer, router]);

  async function signOut() {
    setSigningOut(true);
    setSessionError("");
    try {
      await ponyoApi.logout();
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
        {sessionError && <p className="api-form-error" role="alert">{sessionError}</p>}
        {open && isLoading && <p className="account-drawer-loading" role="status">Checking your account…</p>}

        {!isLoading && customer ? <section className="account-drawer-profile account-drawer-profile--signed-in" aria-label="Signed-in account">
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">WELCOME BACK</p><h3>Hello, {customer.firstName || "plush friend"}!</h3><p className="account-drawer-email">{customer.email}</p></div>
        </section> : !isLoading && !authMode && <section className="account-drawer-profile account-drawer-profile--guest" aria-label="Guest account">
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">A LITTLE HOME FOR YOUR PLUSH</p><h3>Your Ponyo account</h3><p className="account-drawer-email">Sign in to follow orders, save favorites, and find your next forever plush.</p></div>
          <div className="account-drawer-auth-actions">
            <button type="button" className="account-drawer-primary" onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" className="account-drawer-secondary" onClick={() => setAuthMode("register")}>Create account</button>
          </div>
        </section>}

        {authMode && !customer && <section className="account-drawer-auth-panel" aria-label={authMode === "register" ? "Create your account" : "Sign in"}>
          <button type="button" className="account-drawer-back" onClick={() => setAuthMode(null)}>← Account overview</button>
          <AccountAuthForm key={authMode} mode={authMode} presentation="drawer" showDrawerTabs={false} onAuthenticated={(profile) => { setSessionCustomer(profile); setAuthMode(null); setOpen(false); router.push("/"); }} onClose={() => setOpen(false)} />
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
