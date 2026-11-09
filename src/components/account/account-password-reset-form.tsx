"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

function meetsPasswordPolicy(value: string) {
  return value.length >= 8 && value.length <= 128 && /\d/.test(value) && /[^\p{L}\p{N}]/u.test(value);
}

export function AccountPasswordResetForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!PONYO_API_BASE_URL) {
      setErrorMessage("Account service is not connected yet. Please try again later.");
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setErrorMessage("This reset link is missing its security token. Request a fresh link to continue.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const submittedPassword = String(data.get("password") ?? "");
    const submittedConfirmation = String(data.get("confirmation") ?? "");
    if (!meetsPasswordPolicy(submittedPassword)) {
      setErrorMessage("Use 8–128 characters, at least one number, and at least one special character.");
      return;
    }
    if (submittedPassword !== submittedConfirmation) {
      setErrorMessage("Those passwords don’t match yet.");
      return;
    }
    setIsSubmitting(true);
    try {
      await ponyoApi.confirmPasswordReset(token, submittedPassword);
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "This reset link could not be used. Request a fresh one.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="account-auth-page"><section className="account-auth-card" aria-labelledby="reset-password-title">
    <Link href="/" className="account-auth-brand" aria-label="Ponyo home"><span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span><strong>PONYO</strong></Link>
    <div className="account-auth-heading"><span className="account-auth-eyebrow">A FRESH LITTLE START</span><h1 id="reset-password-title">Choose a new password</h1><p>Make it at least 8 characters so your Ponyo account stays safe.</p></div>
    {submitted ? <div className="account-auth-success" role="status"><span aria-hidden="true">✓</span><strong>Password updated</strong><p>Your Ponyo account is ready for you again.</p><Link className="account-reset-login-link" href="/account/login">Back to sign in <span aria-hidden="true">→</span></Link></div> : <form className="account-auth-form" onSubmit={handleSubmit}>
      <label>New password<input name="password" type="password" autoComplete="new-password" placeholder="Create a secure password" minLength={8} maxLength={128} value={password} aria-describedby="reset-password-hint" aria-invalid={password.length > 0 && !meetsPasswordPolicy(password)} onChange={(event) => setPassword(event.target.value)} required /><PasswordChecklist password={password} id="reset-password-hint" /></label>
      <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" placeholder="Type it one more time" minLength={8} maxLength={128} value={confirmation} aria-describedby="reset-confirmation-hint" aria-invalid={confirmation.length > 0 && confirmation !== password} onChange={(event) => setConfirmation(event.target.value)} required /><small id="reset-confirmation-hint" className={`account-password-hint${confirmation.length === 0 ? "" : confirmation === password ? " is-valid" : " is-invalid"}`} aria-live="polite">{confirmation.length === 0 ? "Re-enter your new password to confirm." : confirmation === password ? "Passwords match." : "Passwords don’t match yet."}</small></label>
      {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      <button className="account-auth-submit" type="submit" disabled={isSubmitting || !meetsPasswordPolicy(password) || confirmation !== password}>{isSubmitting ? "Saving…" : "Save new password"}<span aria-hidden="true">♡</span></button>
      <Link className="account-reset-request-link" href="/account/forgot-password">Request another reset link</Link>
    </form>}
    <Link className="account-auth-back" href="/">← Continue shopping</Link>
  </section><aside className="account-auth-aside" aria-label="Ponyo account benefits"><Image className="account-auth-aside-mascot" src="/ponyo-jellyfish.svg" alt="" width={68} height={68} /><p>A LITTLE HOME FOR YOUR PLUSH</p><h2>Back to all the soft things.</h2><ul><li>Your account details</li><li>Your order history</li><li>Your next forever plush</li></ul></aside></main>;
}

function PasswordChecklist({ password, id }: { password: string; id: string }) {
  const checks = [
    { label: "8–128 characters", valid: password.length >= 8 && password.length <= 128 },
    { label: "At least one number", valid: /\d/.test(password) },
    { label: "At least one special character", valid: /[^\p{L}\p{N}]/u.test(password) },
  ];
  return <ul id={id} className="account-password-checklist" aria-label="Password requirements" aria-live="polite">{checks.map((check) => <li className={check.valid ? "is-valid" : ""} key={check.label}><span aria-hidden="true">{check.valid ? "✓" : "○"}</span> {check.label}</li>)}</ul>;
}
