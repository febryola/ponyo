"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL, type CustomerProfile } from "@/services/ponyo-api.client";

export function AccountDrawer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const openAccount = () => {
      setSessionError("");
      setCheckingSession(Boolean(PONYO_API_BASE_URL));
      setOpen(true);
    };
    window.addEventListener("ponyo:account-open", openAccount);
    return () => window.removeEventListener("ponyo:account-open", openAccount);
  }, []);

  useEffect(() => {
    if (!open || !PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe()
      .then((profile) => { if (active) setCustomer(profile); })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiRequestError && error.status === 401)) {
          setSessionError("We couldn't check your Ponyo session. You can still try signing in below.");
        }
        setCustomer(null);
      })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    setSessionError("");
    try {
      await ponyoApi.logout();
      setCustomer(null);
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
        {checkingSession ? <p className="account-drawer-loading" role="status">Checking your account…</p> : customer ? <section className="account-drawer-profile" aria-label="Signed-in account">
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <p className="account-auth-eyebrow">WELCOME BACK</p>
          <h3>Hello, {customer.firstName || "plush friend"}!</h3>
          <p className="account-drawer-email">{customer.email}</p>
          <nav aria-label="Account links">
            <Link href="/orders" onClick={() => setOpen(false)}>Your orders <span aria-hidden="true">→</span></Link>
            <Link href="/collections/all?view=wishlist" onClick={() => setOpen(false)}>Saved plush <span aria-hidden="true">→</span></Link>
            <Link href="/account/addresses" onClick={() => setOpen(false)}>Delivery addresses <span aria-hidden="true">→</span></Link>
          </nav>
          <button type="button" className="account-drawer-signout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </section> : <AccountAuthForm mode="login" presentation="drawer" onAuthenticated={setCustomer} onClose={() => setOpen(false)} />}
      </div>
    </dialog>
  );
}
