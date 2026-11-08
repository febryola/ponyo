"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiNotConfiguredError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import type { CustomerProfile } from "@/services/ponyo-api.client";

type AuthMode = "login" | "register" | "forgot";

export function AccountAuthForm({ mode: initialMode, presentation = "page", onAuthenticated, onClose }: { mode: AuthMode; presentation?: "page" | "drawer"; onAuthenticated?: (customer: CustomerProfile) => void; onClose?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [offers, setOffers] = useState(false);
  const isDrawer = presentation === "drawer";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setSubmitted(false);
    setErrorMessage("");
  }, [initialMode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!PONYO_API_BASE_URL) {
      setSubmitted(true);
      return;
    }
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        const customer = await ponyoApi.login(email, password);
        if (onAuthenticated) onAuthenticated(customer);
        else router.push("/orders");
      } else if (mode === "register") {
        const fullName = String(formData.get("name") ?? "").trim();
        const [firstName = "", ...lastNameParts] = fullName.split(/\s+/);
        const customer = await ponyoApi.register({ firstName, lastName: lastNameParts.join(" "), email, password, marketingOptIn: offers });
        if (onAuthenticated) onAuthenticated(customer);
        else router.push("/orders");
      } else {
        await ponyoApi.requestPasswordReset(email);
        setSubmitted(true);
      }
    } catch (error) {
      setErrorMessage(error instanceof ApiNotConfiguredError ? "Account service is not configured yet." : error instanceof Error ? error.message : "Unable to complete this request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const subtitle = mode === "register"
    ? "Save your favorites and keep your Ponyo orders close."
    : mode === "forgot"
      ? "Password reset emails are not set up yet. Contact Ponyo support and we’ll help you get back in."
      : "Sign in or create an account to see your Ponyo orders.";

  return (
    <main className={`account-auth-page${isDrawer ? " account-auth-page--drawer" : ""}`}>
      <section className={`account-auth-card${isDrawer ? " account-auth-card--drawer" : ""}`} aria-labelledby="account-auth-title">
        {!isDrawer && <Link href="/" className="account-auth-brand" aria-label="Ponyo home"><span aria-hidden="true">✿</span><strong>PONYO</strong></Link>}
        <div className="account-auth-heading">
          <span className="account-auth-eyebrow">YOUR PONYO ACCOUNT</span>
          <h1 id="account-auth-title">{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="account-auth-tabs" aria-label="Account options">
          {isDrawer ? <>
            <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setSubmitted(false); setErrorMessage(""); }}>Sign in</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => { setMode("register"); setSubmitted(false); setErrorMessage(""); }}>Create account</button>
          </> : <>
            <Link className={mode === "login" ? "is-active" : ""} href="/account/login">Sign in</Link>
            <Link className={mode === "register" ? "is-active" : ""} href="/account/register">Create account</Link>
          </>}
        </div>
        {submitted ? (
          <div className="account-auth-success" role="status">
            <span aria-hidden="true">✓</span>
            <strong>{mode === "forgot" ? "Password reset unavailable" : mode === "register" ? "Account preview" : "Sign-in preview"}</strong>
            <p>{mode === "forgot" ? "Password reset email delivery is not configured. Please contact Ponyo support." : PONYO_API_BASE_URL ? "Your request reached the Ponyo API." : "Preview only: no account was created and no email was sent. Connect the Ponyo API to test sign-in and registration."}</p>
            <button type="button" className="account-auth-submit" onClick={() => setSubmitted(false)}>Back to form</button>
          </div>
        ) : (
          <form className="account-auth-form" onSubmit={handleSubmit}>
            {mode === "register" && <label>Full name<input name="name" type="text" autoComplete="name" placeholder="Your name" required /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            {mode !== "forgot" && <label>Password<span className="account-password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Enter your password" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>}
            {mode === "login" && <div className="account-auth-form-options">{isDrawer ? <button type="button" onClick={() => { setMode("forgot"); setSubmitted(false); setErrorMessage(""); }}>Forgot password?</button> : <Link href="/account/forgot-password">Forgot password?</Link>}</div>}
            {mode === "register" && <label className="account-check-option"><input type="checkbox" checked={offers} onChange={(event) => setOffers(event.target.checked)} />Email me with news and offers</label>}
            {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
            <button className="account-auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset instructions" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>
        )}
        <div className="account-auth-divider"><span>or</span></div>
        <p className="account-auth-help">{isDrawer ? <><Link href="/orders" onClick={onClose}>View order history</Link><span aria-hidden="true"> · </span><Link href="/pages/contact" onClick={onClose}>Contact Ponyo support</Link></> : <><Link href="/orders">View order history</Link><span aria-hidden="true"> · </span><Link href="/pages/contact">Contact Ponyo support</Link></>}</p>
        {!isDrawer && <Link className="account-auth-back" href="/">← Continue shopping</Link>}
      </section>
      {!isDrawer && <aside className="account-auth-aside" aria-label="Ponyo account benefits">
        <span className="account-auth-aside-flower" aria-hidden="true">✿</span>
        <p>YOUR FAVORITES, ALL IN ONE PLACE</p>
        <h2>More room for the plush you love.</h2>
        <ul><li>Keep a wishlist close</li><li>Review your order history</li><li>Find your next forever plush</li></ul>
        <span className="account-auth-aside-note">Thoughtfully found, ready to be loved.</span>
      </aside>}
    </main>
  );
}
