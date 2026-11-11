"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import styles from "./verification.module.css";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "request">("loading");
  const [message, setMessage] = useState("Verifying your Ponyo account…");
  const verification = useRef<Promise<unknown> | null>(null);
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resendError, setResendError] = useState("");

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      // Visiting the resend page says nothing about an account's verification status.
      Promise.resolve().then(() => {
        if (!active) return;
        setStatus("request");
        setMessage("Already verified? You’re all set. Just sign in—email verification is only needed once.");
      });
      return () => { active = false; };
    }
    // Share one request across Strict Mode's effect replay: tokens are single-use.
    verification.current ??= Promise.resolve().then(() => {
      if (!PONYO_API_BASE_URL) throw new Error("Account service is not connected yet. Please try again later.");
      return ponyoApi.verifyEmail(token);
    });
    verification.current
      .then(() => {
        if (!active) return;
        setStatus("success");
        setMessage("Your Ponyo account is now verified.");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "This verification link could not be used. Request a fresh one.");
      });
    return () => { active = false; };
  }, []);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendNotice("");
    setResendError("");
    try {
      await ponyoApi.resendVerificationEmail(email);
      setResendNotice("If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder.");
    } catch (error) {
      setResendError(error instanceof Error ? error.message : "Unable to resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-labelledby="verify-email-title">
        <Link href="/" className="account-auth-brand" aria-label="Ponyo home">
          <span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span>
          <strong>PONYO</strong>
        </Link>
        <div className={styles.heading}>
          <span className="account-auth-eyebrow">EMAIL VERIFICATION</span>
          <h1 id="verify-email-title">{status === "success" ? "You’re verified!" : status === "request" ? "Ready when you are" : status === "error" ? "This link can’t be used" : "Checking your email"}</h1>
          <p>{message}</p>
        </div>

        {status === "success" ? (
          <div className={`account-auth-success ${styles.success}`} role="status">
            <span aria-hidden="true">✓</span>
            <strong>Welcome to Ponyo</strong>
            <p>Your email is confirmed. No need to verify again—sign in and enjoy your next little find.</p>
            <Link className={styles.primary} href="/account/login">Go to sign in <span aria-hidden="true">→</span></Link>
          </div>
        ) : status === "error" || status === "request" ? (
          <div className={styles.actions}>
            <Link className={styles.primary} href="/account/login">{status === "error" ? "Already verified? Sign in" : "Go to sign in"}<span aria-hidden="true">→</span></Link>
            <details className={styles.resend}>
              <summary>Still need a verification email?</summary>
              <p>Only request a new link if your email hasn’t been confirmed or your previous link expired.</p>
              <form className={styles.form} onSubmit={handleResend}>
              <label htmlFor="verification-email">Email address</label>
              <input id="verification-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <button className={styles.secondary} type="submit" disabled={resending}>{resending ? "Sending…" : "Send a new verification email"}</button>
              {resendNotice && <p role="status">{resendNotice}</p>}
              {resendError && <p className="api-form-error" role="alert">{resendError}</p>}
              </form>
            </details>
          </div>
        ) : <p role="status">Please wait while we verify your email…</p>}
        <Link className={styles.back} href="/">← Continue shopping</Link>
      </section>
    </main>
  );
}
