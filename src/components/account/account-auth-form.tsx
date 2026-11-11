"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import type { CustomerProfile } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

type AuthMode = "login" | "register" | "forgot";

export function AccountAuthForm({ mode: initialMode, presentation = "page", showDrawerTabs = true, onAuthenticated, onClose }: { mode: AuthMode; presentation?: "page" | "drawer"; showDrawerTabs?: boolean; onAuthenticated?: (customer: CustomerProfile) => void; onClose?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [submitted, setSubmitted] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [offers, setOffers] = useState(false);
  const isDrawer = presentation === "drawer";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { setCustomer } = useCustomerSession();
  const passwordHasLength = password.length >= 8;
  const passwordHasNumber = /\d/.test(password);
  const passwordHasSpecial = /[^\p{L}\p{N}]/u.test(password);
  const isStrongRegistrationPassword = passwordHasLength && passwordHasNumber && passwordHasSpecial;

  function getPostAuthDestination() {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested?.startsWith("/")) return "/account";
    const destination = new URL(requested, window.location.origin);
    return destination.origin === window.location.origin ? destination.pathname + destination.search + destination.hash : "/account";
  }

  async function handleResend() {
    setIsSubmitting(true);
    setErrorMessage("");
    setNotice("");
    try {
      await ponyoApi.resendVerificationEmail(verificationEmail || email);
      setVerificationSent(true);
      setNotice("If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to resend the verification email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setNotice("");
    setVerificationEmail("");
    if (!PONYO_API_BASE_URL) {
      setErrorMessage("Account service is not connected yet. Please try again later.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        const customer = await ponyoApi.login(email, password);
        setCustomer(customer);
        if (onAuthenticated) onAuthenticated(customer);
        else router.push(getPostAuthDestination());
      } else if (mode === "register") {
        const fullName = String(formData.get("name") ?? "").trim();
        const [firstName = "", ...lastNameParts] = fullName.split(/\s+/);
        await ponyoApi.register({ firstName, lastName: lastNameParts.join(" "), email, password, marketingOptIn: offers });
        setVerificationEmail(email);
        setVerificationSent(true);
        setSubmitted(true);
        setEmail(email);
        setPassword("");
        setMode("register");
        return;
      } else {
        await ponyoApi.requestPasswordReset(email);
        setSubmitted(true);
      }
    } catch (error) {
      const isFetchFailure = error instanceof TypeError ||
        (error instanceof Error && /Failed to fetch|NetworkError/i.test(error.message));

      if (error instanceof ApiNotConfiguredError) {
        setErrorMessage("Account service is not connected yet. Please try again later.");
      } else if (isFetchFailure) {
        setErrorMessage("The Ponyo service is temporarily unavailable. Please try again in a moment.");
      } else if (error instanceof Error && "status" in error && error.status === 401) {
        setErrorMessage("We couldn't sign you in. Check your details or create a new account if you haven't joined Ponyo yet.");
      } else if (error instanceof ApiRequestError && error.code === "email_verification_required") {
        setVerificationEmail(email);
        setErrorMessage("Please verify your email before signing in.");
      } else if (error instanceof ApiRequestError && error.code === "verification_email_delivery_failed") {
        setVerificationEmail(email);
        setVerificationSent(false);
        setPassword("");
        setSubmitted(true);
        setErrorMessage(error.message);
      } else if (error instanceof Error && "status" in error && error.status === 409) {
        setEmail(email);
        setPassword("");
        setMode("login");
        setErrorMessage("This email is already registered. Sign in to continue.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Unable to complete this request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const subtitle = mode === "register"
    ? "Save your favorites and keep your Ponyo orders close."
    : mode === "forgot"
      ? "We’ll send a one-hour reset link if that email belongs to a Ponyo account."
      : "Sign in or create an account to see your Ponyo orders.";

  return (
    <main className={`account-auth-page${isDrawer ? " account-auth-page--drawer" : ""}`}>
      <section className={`account-auth-card${isDrawer ? " account-auth-card--drawer" : ""}`} aria-labelledby="account-auth-title">
        {!isDrawer && <Link href="/" className="account-auth-brand" aria-label="Ponyo home"><span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span><strong>PONYO</strong></Link>}
        <div className="account-auth-heading">
          <span className="account-auth-eyebrow">YOUR PONYO ACCOUNT</span>
          <h1 id="account-auth-title">{title}</h1>
          <p>{subtitle}</p>
        </div>
        {(!isDrawer || showDrawerTabs) && <div className="account-auth-tabs" aria-label="Account options">
          {isDrawer ? <>
            <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setSubmitted(false); setErrorMessage(""); }}>Sign in</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => { setMode("register"); setSubmitted(false); setErrorMessage(""); }}>Create account</button>
          </> : <>
            <Link className={mode === "login" ? "is-active" : ""} href="/account/login">Sign in</Link>
            <Link className={mode === "register" ? "is-active" : ""} href="/account/register">Create account</Link>
          </>}
        </div>}
        {submitted ? (
          <div className="account-auth-success" role="status">
            <span aria-hidden="true">✉</span>
            <strong>{mode === "forgot" ? "Check your email" : verificationSent ? "Check your email!" : "Your account is pending verification"}</strong>
            <p>
              {mode === "forgot"
                ? "If an account matches that email, look for a secure reset link in your inbox. If it doesn’t arrive, contact Ponyo support."
                : verificationSent
                  ? `We’ve sent a verification link to ${verificationEmail || "your email"}. Please check your inbox to activate your Ponyo account.`
                  : "Your account is not active yet. We couldn’t send the verification email. Use the resend button to try again."}
            </p>
            {mode !== "forgot" && <div className="account-auth-verification-actions"><p className="account-auth-verification-note">Didn’t receive the email? Check your spam folder or request another verification email.</p><button type="button" className="account-auth-submit account-auth-submit--secondary" onClick={handleResend} disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Resend verification email"}</button></div>}
            {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="button" className="account-auth-submit" onClick={() => { setSubmitted(false); setMode("login"); setErrorMessage(""); setNotice(""); }}>Back to sign in</button>
          </div>
        ) : (
          <form className="account-auth-form" onSubmit={handleSubmit}>
            {mode === "register" && <label>Full name<input name="name" type="text" autoComplete="name" placeholder="Your name" required /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {mode !== "forgot" && <label>Password<span className="account-password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Enter your password" minLength={8} maxLength={128} value={password} aria-describedby={mode === "register" ? "account-password-hint" : undefined} aria-invalid={mode === "register" && password.length > 0 && !isStrongRegistrationPassword} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span>{mode === "register" && <ul id="account-password-hint" className="account-password-checklist" aria-label="Password requirements" aria-live="polite"><li className={passwordHasLength ? "is-valid" : ""}><span aria-hidden="true">{passwordHasLength ? "✓" : "○"}</span> 8–128 characters</li><li className={passwordHasNumber ? "is-valid" : ""}><span aria-hidden="true">{passwordHasNumber ? "✓" : "○"}</span> At least one number</li><li className={passwordHasSpecial ? "is-valid" : ""}><span aria-hidden="true">{passwordHasSpecial ? "✓" : "○"}</span> At least one special character</li></ul>}</label>}
            {mode === "login" && <div className="account-auth-form-options">{isDrawer ? <button type="button" onClick={() => { setMode("forgot"); setSubmitted(false); setErrorMessage(""); }}>Forgot password?</button> : <Link href="/account/forgot-password">Forgot password?</Link>}</div>}
            {mode === "register" && <label className="account-check-option"><input type="checkbox" checked={offers} onChange={(event) => setOffers(event.target.checked)} />Email me with news and offers</label>}
            {errorMessage && <div className="account-auth-error" role="alert"><p className="api-form-error">{errorMessage}</p>{mode === "login" && <Link href="/account/register">Create a Ponyo account <span aria-hidden="true">→</span></Link>}{mode === "register" && <Link href="/account/login">Go to sign in <span aria-hidden="true">→</span></Link>}</div>}
            {mode === "login" && verificationEmail === email && verificationEmail && <button type="button" className="account-auth-submit account-auth-submit--secondary" onClick={handleResend} disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Resend verification email"}</button>}
            {notice && <p role="status">{notice}</p>}
            <button className="account-auth-submit" type="submit" disabled={isSubmitting || (mode === "register" && !isStrongRegistrationPassword)}>{isSubmitting ? "Please wait…" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset instructions" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>
        )}
        <div className="account-auth-divider"><span>or</span></div>
        <p className="account-auth-help">{isDrawer ? <><Link href="/orders" onClick={onClose}>View order history</Link><span aria-hidden="true"> · </span><Link href="/pages/contact" onClick={onClose}>Contact Ponyo support</Link></> : <><Link href="/orders">View order history</Link><span aria-hidden="true"> · </span><Link href="/pages/contact">Contact Ponyo support</Link></>}</p>
        {!isDrawer && <Link className="account-auth-back" href="/">← Continue shopping</Link>}
      </section>
      {!isDrawer && <aside className="account-auth-aside" aria-label="Ponyo account benefits">
        <Image className="account-auth-aside-mascot" src="/ponyo-jellyfish.svg" alt="" width={68} height={68} />
        <p>YOUR FAVORITES, ALL IN ONE PLACE</p>
        <h2>More room for the plush you love.</h2>
        <ul><li>Keep a wishlist close</li><li>Review your order history</li><li>Find your next forever plush</li></ul>
        <span className="account-auth-aside-note">Thoughtfully found, ready to be loved.</span>
      </aside>}
    </main>
  );
}
