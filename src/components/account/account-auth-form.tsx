"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import type { CustomerProfile } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { useLocalization } from "@/components/layout/localization-provider";

type AuthMode = "login" | "register" | "forgot";

export function AccountAuthForm({ mode: initialMode, presentation = "page", showDrawerTabs = true, onAuthenticated, onClose }: { mode: AuthMode; presentation?: "page" | "drawer"; showDrawerTabs?: boolean; onAuthenticated?: (customer: CustomerProfile) => void; onClose?: () => void }) {
  const router = useRouter();
  const { t } = useLocalization();
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
  const [errorCode, setErrorCode] = useState("");
  const { setCustomer } = useCustomerSession();
  const passwordHasLength = password.length >= 8 && password.length <= 128;
  const passwordHasNumber = /\d/.test(password);
  const passwordHasSpecial = /[^\p{L}\p{N}]/u.test(password);
  const isStrongRegistrationPassword = passwordHasLength && passwordHasNumber && passwordHasSpecial;

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setSubmitted(false);
    setErrorMessage("");
    setErrorCode("");
    setNotice("");
    setVerificationEmail("");
    setVerificationSent(false);
    setShowPassword(false);
    setPassword("");
  }

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
      setNotice(t("account.auth.resend_notice", "If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder."));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("account.auth.resend_failed", "Unable to resend the verification email."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setErrorCode("");
    setNotice("");
    setVerificationEmail("");
    if (!PONYO_API_BASE_URL) {
      setErrorMessage(t("account.auth.service_not_connected", "Account service is not connected yet. Please try again later."));
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
        setErrorMessage(t("account.auth.service_not_connected", "Account service is not connected yet. Please try again later."));
      } else if (isFetchFailure) {
        setErrorMessage(t("account.auth.service_unavailable", "The Ponyo service is temporarily unavailable. Please try again in a moment."));
      } else if (error instanceof ApiRequestError && error.code === "customer_not_found") {
        setErrorCode(error.code);
        setErrorMessage(t("account.auth.customer_not_found", "This email is not registered. Please create a Ponyo account."));
      } else if (error instanceof ApiRequestError && error.code === "invalid_password") {
        setErrorCode(error.code);
        setErrorMessage(t("account.auth.invalid_password", "Incorrect password. Try again or reset your password."));
      } else if (error instanceof Error && "status" in error && error.status === 401) {
        setErrorCode("unauthorized");
        setErrorMessage(t("account.auth.unauthorized", "We couldn't sign you in. Check your details or create a new account if you haven't joined Ponyo yet."));
      } else if (error instanceof ApiRequestError && error.code === "email_verification_required") {
        setVerificationEmail(email);
        setErrorMessage(t("account.auth.email_verification_required", "Please verify your email before signing in."));
      } else if (error instanceof ApiRequestError && error.code === "verification_email_delivery_failed") {
        setVerificationEmail(email);
        setVerificationSent(false);
        setPassword("");
        setSubmitted(true);
        setErrorMessage(t("account.auth.verification_delivery_failed", "Your account was created, but the verification email couldn’t be sent. Please request another email below."));
      } else if (error instanceof Error && "status" in error && error.status === 409) {
        setEmail(email);
        setPassword("");
        setMode("login");
        setErrorMessage(t("account.auth.email_already_registered", "This email is already registered. Sign in to continue."));
      } else {
        setErrorMessage(error instanceof Error ? error.message : t("account.auth.request_failed", "Unable to complete this request."));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === "register" ? t("account.auth.create_title", "Create your account") : mode === "forgot" ? t("account.auth.reset_title", "Reset your password") : t("account.auth.welcome_back", "Welcome back");
  const subtitle = mode === "register"
    ? t("account.auth.register_subtitle", "A little home for your favorites. Create an account to keep them close.")
    : mode === "forgot"
      ? t("account.auth.reset_subtitle", "Enter your email. If it matches a Ponyo account, we’ll send a reset link valid for one hour.")
      : t("account.auth.login_subtitle", "Your favorite finds and order updates, all in one little place.");

  return (
    <main className={`account-auth-page auth-studio${isDrawer ? " account-auth-page--drawer" : ""}`}>
      <section className={`account-auth-card${isDrawer ? " account-auth-card--drawer" : ""}`} aria-labelledby="account-auth-title">
        {!isDrawer && <Link href="/" className="account-auth-brand" aria-label={t("account.auth.home", "Ponyo home")}><span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span><strong>PONYO</strong></Link>}
        <div className="account-auth-heading">
          <span className="account-auth-eyebrow">{t("account.auth.eyebrow", "YOUR PONYO ACCOUNT")}</span>
          <h1 id="account-auth-title">{title}</h1>
          <p>{subtitle}</p>
        </div>
        {(!isDrawer || showDrawerTabs) && <div className="account-auth-tabs" aria-label={t("account.auth.options", "Account options")}>
          {isDrawer ? <>
            <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => changeMode("login")}>{t("account.auth.sign_in", "Sign in")}</button>
            <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => changeMode("register")}>{t("account.auth.create_account", "Create account")}</button>
          </> : <>
            <Link className={mode === "login" ? "is-active" : ""} href="/account/login">{t("account.auth.sign_in", "Sign in")}</Link>
            <Link className={mode === "register" ? "is-active" : ""} href="/account/register">{t("account.auth.create_account", "Create account")}</Link>
          </>}
        </div>}
        {submitted ? (
          <div className="account-auth-success" role="status">
            <span aria-hidden="true">✉</span>
            <strong>{mode === "forgot" ? t("account.auth.check_email", "Check your email") : verificationSent ? t("account.auth.check_verification_email", "Check your email!") : t("account.auth.pending_verification", "Your account is pending verification")}</strong>
            <p>
              {mode === "forgot"
                ? t("account.auth.reset_sent", "If an account matches that email, look for a secure reset link in your inbox. If it doesn’t arrive, contact Ponyo support.")
                : verificationSent
                  ? t("account.auth.verification_sent", "We’ve sent a verification link to {{ email }}. Please check your inbox to activate your Ponyo account.", { email: verificationEmail || t("account.auth.your_email", "your email") })
                  : t("account.auth.verification_failed", "Your account is not active yet. We couldn’t send the verification email. Use the resend button to try again.")}
            </p>
            {mode !== "forgot" && <div className="account-auth-verification-actions"><p className="account-auth-verification-note">{t("account.auth.verification_help", "Didn’t receive the email? Check your spam folder or request another verification email.")}</p><button type="button" className="account-auth-submit account-auth-submit--secondary" onClick={handleResend} disabled={isSubmitting}>{isSubmitting ? t("account.auth.sending", "Sending…") : t("account.auth.resend_verification", "Resend verification email")}</button></div>}
            {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="button" className="account-auth-submit" onClick={() => changeMode("login")}>{t("account.auth.back_to_sign_in", "Back to sign in")}</button>
          </div>
        ) : (
          <form className="account-auth-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
            {mode === "register" && <label>{t("account.auth.full_name", "Full name")}<input name="name" type="text" autoComplete="name" placeholder={t("account.auth.name_placeholder", "Your name")} required /></label>}
            <label>{t("account.auth.email", "Email address")}<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {mode !== "forgot" && <label>{t("account.auth.password", "Password")}<span className="account-password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={t("account.auth.password_placeholder", "Enter your password")} minLength={8} maxLength={128} value={password} aria-describedby={mode === "register" ? "account-password-hint" : undefined} aria-invalid={mode === "register" && password.length > 0 && !isStrongRegistrationPassword} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("account.auth.hide_password", "Hide password") : t("account.auth.show_password", "Show password")}>{showPassword ? t("account.auth.hide", "Hide") : t("account.auth.show", "Show")}</button></span>{mode === "register" && <ul id="account-password-hint" className="account-password-checklist" aria-label={t("account.auth.password_requirements", "Password requirements")} aria-live="polite"><li className={passwordHasLength ? "is-valid" : ""}><span aria-hidden="true">{passwordHasLength ? "✓" : "○"}</span> {t("account.auth.password_length", "8–128 characters")}</li><li className={passwordHasNumber ? "is-valid" : ""}><span aria-hidden="true">{passwordHasNumber ? "✓" : "○"}</span> {t("account.auth.password_number", "At least one number")}</li><li className={passwordHasSpecial ? "is-valid" : ""}><span aria-hidden="true">{passwordHasSpecial ? "✓" : "○"}</span> {t("account.auth.password_special", "At least one special character")}</li></ul>}</label>}
            {mode === "login" && <div className="account-auth-form-options">{isDrawer ? <button type="button" onClick={() => changeMode("forgot")}>{t("account.auth.forgot_password", "Forgot password?")}</button> : <Link href="/account/forgot-password">{t("account.auth.forgot_password", "Forgot password?")}</Link>}</div>}
            {mode === "register" && <label className="account-check-option"><input type="checkbox" checked={offers} onChange={(event) => setOffers(event.target.checked)} />{t("account.auth.offers", "Email me with news and offers")}</label>}
            {errorMessage && <div className="account-auth-error" role="alert">
              <p className="api-form-error">{errorMessage}</p>
              {mode === "login" && (errorCode === "customer_not_found" || errorCode === "unauthorized") && (
                isDrawer
                  ? <button type="button" onClick={() => changeMode("register")}>{t("account.auth.create_ponyo_account", "Create a Ponyo account")} <span aria-hidden="true">→</span></button>
                  : <Link href="/account/register">{t("account.auth.create_ponyo_account", "Create a Ponyo account")} <span aria-hidden="true">→</span></Link>
              )}
              {mode === "login" && errorCode === "invalid_password" && (
                isDrawer
                  ? <button type="button" onClick={() => changeMode("forgot")}>{t("account.auth.forgot_password", "Forgot password?")} <span aria-hidden="true">→</span></button>
                  : <Link href="/account/forgot-password">{t("account.auth.forgot_password", "Forgot password?")} <span aria-hidden="true">→</span></Link>
              )}
              {mode === "register" && <Link href="/account/login">{t("account.auth.go_to_sign_in", "Go to sign in")} <span aria-hidden="true">→</span></Link>}
            </div>}
            {mode === "login" && verificationEmail === email && verificationEmail && <button type="button" className="account-auth-submit account-auth-submit--secondary" onClick={handleResend} disabled={isSubmitting}>{isSubmitting ? t("account.auth.sending", "Sending…") : t("account.auth.resend_verification", "Resend verification email")}</button>}
            {notice && <p role="status">{notice}</p>}
            <button className="account-auth-submit" type="submit" disabled={isSubmitting || (mode === "register" && !isStrongRegistrationPassword)}>{isSubmitting ? t("account.auth.please_wait", "Please wait…") : mode === "register" ? t("account.auth.create_account", "Create account") : mode === "forgot" ? t("account.auth.send_reset", "Send reset instructions") : t("account.auth.sign_in", "Sign in")}<span aria-hidden="true">→</span></button>
          </form>
        )}
        <div className="account-auth-divider" aria-hidden="true" />
        <p className="account-auth-help">{isDrawer ? <><Link href="/orders" onClick={onClose}>{t("account.auth.order_history", "View order history")}</Link><span aria-hidden="true"> · </span><Link href="/pages/contact" onClick={onClose}>{t("account.auth.support", "Contact Ponyo support")}</Link></> : <><Link href="/orders">{t("account.auth.order_history", "View order history")}</Link><span aria-hidden="true"> · </span><Link href="/pages/contact">{t("account.auth.support", "Contact Ponyo support")}</Link></>}</p>
        {!isDrawer && <Link className="account-auth-back" href="/">{t("account.auth.continue_shopping", "← Continue shopping")}</Link>}
      </section>
      {!isDrawer && <aside className="account-auth-aside" aria-label={t("account.auth.benefits", "Ponyo account benefits")}>
        <Image className="account-auth-aside-mascot" src="/ponyo-jellyfish.svg" alt="" width={68} height={68} />
        <p>{t("account.auth.benefits_eyebrow", "LITTLE FINDS. LASTING JOY.")}</p>
        <h2>{t("account.auth.benefits_title", "A soft spot for your favorites.")}</h2>
        <ul><li>{t("account.auth.benefit_wishlist", "Keep a wishlist close")}</li><li>{t("account.auth.benefit_orders", "Review your order history")}</li><li>{t("account.auth.benefit_discover", "Find your next forever plush")}</li></ul>
        <span className="account-auth-aside-note">{t("account.auth.benefits_note", "Thoughtfully found. Ready to be loved.")}</span>
      </aside>}
    </main>
  );
}
