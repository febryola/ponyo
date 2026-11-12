"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useLocalization } from "@/components/layout/localization-provider";

function meetsPasswordPolicy(value: string) {
  return value.length >= 8 && value.length <= 128 && /\d/.test(value) && /[^\p{L}\p{N}]/u.test(value);
}

export function AccountPasswordResetForm() {
  const { t } = useLocalization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordUnchanged, setPasswordUnchanged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage("");
    setPasswordUnchanged(false);
    if (!PONYO_API_BASE_URL) {
      setErrorMessage(t("account.auth.service_not_connected", "Account service is not connected yet. Please try again later."));
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setErrorMessage(t("account.auth.reset_missing_token", "This reset link is incomplete. Request a new link to continue."));
      return;
    }
    const data = new FormData(event.currentTarget);
    const submittedPassword = String(data.get("password") ?? "");
    const submittedConfirmation = String(data.get("confirmation") ?? "");
    if (!meetsPasswordPolicy(submittedPassword)) {
      setErrorMessage(t("account.auth.password_policy", "Use 8–128 characters, at least one number, and at least one special character."));
      return;
    }
    if (submittedPassword !== submittedConfirmation) {
      setErrorMessage(t("account.auth.password_mismatch", "Those passwords don’t match yet."));
      return;
    }
    setIsSubmitting(true);
    try {
      await ponyoApi.confirmPasswordReset(token, submittedPassword);
      setPassword("");
      setConfirmation("");
      setShowPassword(false);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "password_unchanged") {
        // Keep the fields and URL token intact so this policy error is recoverable.
        setPasswordUnchanged(true);
      } else if (error instanceof ApiNotConfiguredError) {
        setErrorMessage(t("account.auth.service_not_connected", "Account service is not connected yet. Please try again later."));
      } else if (error instanceof TypeError || (error instanceof Error && /Failed to fetch|NetworkError/i.test(error.message))) {
        setErrorMessage(t("account.auth.service_unavailable", "The Ponyo service is temporarily unavailable. Please try again in a moment."));
      } else if (error instanceof ApiRequestError && (error.status === 400 || error.status === 410)) {
        setErrorMessage(t("account.auth.reset_link_failed", "This reset link is invalid or has expired. Request a new one to continue."));
      } else {
        // Unknown API details remain intact rather than mislabeling every failure as an expired link.
        setErrorMessage(error instanceof Error ? error.message : t("account.auth.request_failed", "Unable to complete this request."));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="account-auth-page auth-studio">
      <section className="account-auth-card" aria-labelledby="reset-password-title">
        <Link href="/" className="account-auth-brand" aria-label={t("account.auth.home", "Ponyo home")}><span><Image src="/ponyo-jellyfish.svg" alt="" width={30} height={30} /></span><strong>PONYO</strong></Link>
        <div className="account-auth-heading">
          <span className="account-auth-eyebrow">{t("account.auth.reset_eyebrow", "A FRESH START")}</span>
          <h1 id="reset-password-title">{t("account.auth.new_password_title", "Choose a new password")}</h1>
          <p>{t("account.auth.new_password_subtitle", "A fresh password for your little corner of Ponyo. Choose one different from your current password.")}</p>
        </div>
        {submitted ? <div className="account-auth-success" role="status">
          <span aria-hidden="true">✓</span>
          <strong>{t("account.auth.password_updated", "Password updated")}</strong>
          <p>{t("account.auth.password_updated_body", "You’re ready to sign in again with your new password.")}</p>
          <Link className="account-auth-submit" href="/account/login">{t("account.auth.back_to_sign_in", "Back to sign in")} <span aria-hidden="true">→</span></Link>
        </div> : <form className="account-auth-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
          <label>{t("account.auth.new_password", "New password")}
            <span className="account-password-field">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder={t("account.auth.new_password_placeholder", "Create a secure password")} minLength={8} maxLength={128} value={password} aria-describedby={`reset-password-hint reset-password-rule${passwordUnchanged ? " reset-password-error" : ""}`} aria-invalid={passwordUnchanged || (password.length > 0 && !meetsPasswordPolicy(password))} onChange={(event) => { setPassword(event.target.value); setPasswordUnchanged(false); }} required />
              <button type="button" aria-pressed={showPassword} aria-label={showPassword ? t("account.auth.hide_password", "Hide password") : t("account.auth.show_password", "Show password")} onClick={() => setShowPassword((value) => !value)}>{showPassword ? t("account.auth.hide", "Hide") : t("account.auth.show", "Show")}</button>
            </span>
            <PasswordChecklist password={password} id="reset-password-hint" />
            <small id="reset-password-rule" className="account-password-hint">{t("account.auth.password_different", "Your new password must be different from your current password.")}</small>
          </label>
          <label>{t("account.auth.confirm_password", "Confirm new password")}
            <input name="confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder={t("account.auth.confirm_placeholder", "Enter your new password again")} minLength={8} maxLength={128} value={confirmation} aria-describedby="reset-confirmation-hint" aria-invalid={confirmation.length > 0 && confirmation !== password} onChange={(event) => setConfirmation(event.target.value)} required />
            <small id="reset-confirmation-hint" className={`account-password-hint${confirmation.length === 0 ? "" : confirmation === password ? " is-valid" : " is-invalid"}`} aria-live="polite">{confirmation.length === 0 ? t("account.auth.confirm_hint", "Re-enter your new password to confirm.") : confirmation === password ? t("account.auth.passwords_match", "Passwords match.") : t("account.auth.password_mismatch", "Those passwords don’t match yet.")}</small>
          </label>
          {(passwordUnchanged || errorMessage) && <div className="account-auth-error" role="alert" id="reset-password-error"><p className="api-form-error">{passwordUnchanged ? t("account.auth.password_unchanged", "Choose a new password that is different from your current password.") : errorMessage}</p></div>}
          <button className="account-auth-submit" type="submit" disabled={isSubmitting || !meetsPasswordPolicy(password) || confirmation !== password}>{isSubmitting ? t("account.auth.saving", "Saving…") : t("account.auth.save_password", "Save new password")}<span aria-hidden="true">→</span></button>
          <Link className="account-reset-request-link" href="/account/forgot-password">{t("account.auth.request_reset_link", "Request a new reset link")}</Link>
        </form>}
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

function PasswordChecklist({ password, id }: { password: string; id: string }) {
  const { t } = useLocalization();
  const checks = [
    { label: t("account.auth.password_length", "8–128 characters"), valid: password.length >= 8 && password.length <= 128 },
    { label: t("account.auth.password_number", "At least one number"), valid: /\d/.test(password) },
    { label: t("account.auth.password_special", "At least one special character"), valid: /[^\p{L}\p{N}]/u.test(password) },
  ];
  return <ul id={id} className="account-password-checklist" aria-label={t("account.auth.password_requirements", "Password requirements")} aria-live="polite">{checks.map((check) => <li className={check.valid ? "is-valid" : ""} key={check.label}><span aria-hidden="true">{check.valid ? "✓" : "○"}</span> {check.label}</li>)}</ul>;
}
