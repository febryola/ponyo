"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiNotConfiguredError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useLocalization } from "@/components/layout/localization-provider";
import styles from "./verification.module.css";

export default function VerifyEmailPage() {
  const { t } = useLocalization();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "request">("loading");
  const [failure, setFailure] = useState<"service" | "network" | "link">("link");
  const verification = useRef<Promise<unknown> | null>(null);
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState(false);
  const [resendError, setResendError] = useState(false);

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      // Visiting the resend page says nothing about an account's verification status.
      Promise.resolve().then(() => {
        if (!active) return;
        setStatus("request");
      });
      return () => { active = false; };
    }
    // Share one request across Strict Mode's effect replay: tokens are single-use.
    verification.current ??= Promise.resolve().then(() => {
      if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
      return ponyoApi.verifyEmail(token);
    });
    verification.current
      .then(() => {
        if (!active) return;
        setStatus("success");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setFailure(error instanceof ApiNotConfiguredError ? "service" : error instanceof TypeError || (error instanceof Error && /Failed to fetch|NetworkError/i.test(error.message)) ? "network" : "link");
      });
    return () => { active = false; };
  }, []);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resending) return;
    setResending(true);
    setResendNotice(false);
    setResendError(false);
    try {
      await ponyoApi.resendVerificationEmail(email);
      setResendNotice(true);
    } catch {
      setResendError(true);
    } finally {
      setResending(false);
    }
  }

  const message = status === "success"
    ? t("account.auth.verify_success", "Your Ponyo account is now verified.")
    : status === "request"
      ? t("account.auth.verify_request", "Already confirmed your email? Simply sign in. You only need to verify once.")
      : status === "error"
        ? failure === "service"
          ? t("account.auth.service_not_connected", "Account service is not connected yet. Please try again later.")
          : failure === "network"
            ? t("account.auth.service_unavailable", "The Ponyo service is temporarily unavailable. Please try again in a moment.")
            : t("account.auth.verify_link_failed", "This verification link is invalid or has expired. You can request a new one below.")
        : t("account.auth.verify_loading", "Please wait while we confirm your email address…");

  return (
    <main className={`account-auth-page auth-studio ${styles.page}`}>
      <section className={`account-auth-card ${styles.card}`} aria-labelledby="verify-email-title">
        <Link href="/" className="account-auth-brand" aria-label={t("account.auth.home", "Ponyo home")}>
          <span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span>
          <strong>PONYO</strong>
        </Link>
        <div className={`account-auth-heading ${styles.heading}`}>
          <span className="account-auth-eyebrow">{t("account.auth.verify_eyebrow", "ONE LITTLE LAST STEP")}</span>
          <h1 id="verify-email-title">{status === "success" ? t("account.auth.verify_success_title", "You’re verified!") : status === "request" ? t("account.auth.verify_request_title", "Let’s get you settled in") : status === "error" ? t("account.auth.verify_error_title", "Let’s try a fresh link") : t("account.auth.verify_loading_title", "Checking your email")}</h1>
          <p role={status === "error" ? "alert" : "status"}>{message}</p>
        </div>

        {status === "success" ? (
          <div className={`account-auth-success ${styles.success}`} role="status">
            <span aria-hidden="true">✓</span>
            <strong>{t("account.auth.verify_welcome", "Welcome to your little corner of Ponyo")}</strong>
            <p>{t("account.auth.verify_success_body", "Your email is confirmed. Sign in to explore your favorites and keep up with your orders.")}</p>
            <Link className={`account-auth-submit ${styles.primary}`} href="/account/login">{t("account.auth.go_to_sign_in", "Go to sign in")} <span aria-hidden="true">→</span></Link>
          </div>
        ) : status === "error" || status === "request" ? (
          <div className={styles.actions}>
            <Link className={`account-auth-submit ${styles.primary}`} href="/account/login">{status === "error" ? t("account.auth.verify_already", "Already verified? Sign in") : t("account.auth.go_to_sign_in", "Go to sign in")}<span aria-hidden="true">→</span></Link>
            <details className={styles.resend}>
              <summary>{t("account.auth.verify_resend_title", "Still need a verification email?")}</summary>
              <p>{t("account.auth.verify_resend_body", "Request a new link if you haven’t confirmed your email yet or your previous link has expired.")}</p>
              <form className={`account-auth-form ${styles.form}`} onSubmit={handleResend} aria-busy={resending}>
              <label htmlFor="verification-email">{t("account.auth.email", "Email address")}</label>
              <input id="verification-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <button className={`account-auth-submit account-auth-submit--secondary ${styles.secondary}`} type="submit" disabled={resending}>{resending ? t("account.auth.sending", "Sending…") : t("account.auth.resend_verification", "Resend verification email")}</button>
              {resendNotice && <p role="status">{t("account.auth.resend_notice", "If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder.")}</p>}
              {resendError && <p className="api-form-error" role="alert">{t("account.auth.resend_failed", "Unable to resend the verification email.")}</p>}
              </form>
            </details>
          </div>
        ) : <div className={styles.loading} aria-hidden="true"><span /><span /><span /></div>}
        <div className="account-auth-divider" aria-hidden="true" />
        <p className="account-auth-help"><Link href="/pages/contact">{t("account.auth.support", "Contact Ponyo support")}</Link></p>
        <Link className="account-auth-back" href="/">{t("account.auth.continue_shopping", "← Continue shopping")}</Link>
      </section>
      <aside className="account-auth-aside" aria-label={t("account.auth.benefits", "Ponyo account benefits")}>
        <Image className="account-auth-aside-mascot" src="/ponyo-jellyfish.svg" alt="" width={68} height={68} />
        <p>{t("account.auth.benefits_eyebrow", "LITTLE FINDS. LASTING JOY.")}</p>
        <h2>{t("account.auth.benefits_title", "A soft spot for your favorites.")}</h2>
        <ul><li>{t("account.auth.benefit_wishlist", "Keep a wishlist close")}</li><li>{t("account.auth.benefit_orders", "Review your order history")}</li><li>{t("account.auth.benefit_discover", "Find your next forever plush")}</li></ul>
        <span className="account-auth-aside-note">{t("account.auth.benefits_note", "Thoughtfully found. Ready to be loved.")}</span>
      </aside>
    </main>
  );
}
