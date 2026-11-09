"use client";

import Image from "next/image";
import { useState } from "react";
import locale from "@/ponyo-shopify/locales/en.default.json";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

export function NewsletterPanel() {
  const [subscribed, setSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [emailEdited, setEmailEdited] = useState(false);
  const { customer } = useCustomerSession();
  const copy = locale.home.newsletter;

  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      if (PONYO_API_BASE_URL) await ponyoApi.subscribeNewsletter(String(formData.get("email") ?? ""));
      setSubscribed(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to subscribe right now.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <section className="store-newsletter store-container" aria-labelledby="store-newsletter-title">
      <div className="newsletter-jellyfish-divider" aria-hidden="true">
        {[22, 16, 20, 15, 22].map((size, index) => <svg key={`${size}-${index}`} width={size} height={size} viewBox="0 0 64 64" style={{ animationDelay: `${index * -0.55}s` }}><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="currentColor"/><circle cx="26" cy="23" r="2.4" fill="#4a3530"/><circle cx="38" cy="23" r="2.4" fill="#4a3530"/><path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>)}
      </div>
      <div className="newsletter-mascot">
        <Image src="https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-penguin.jpg?v=1793843384" alt="" width={90} height={90} />
        <strong>{copy.kicker}</strong>
        <small>{copy.kicker_sub}</small>
      </div>
      <div className="store-newsletter-copy">
        <h2 id="store-newsletter-title">{copy.title}</h2>
        {subscribed ? <p className="newsletter-success" role="status">{copy.success}</p> : (
          <form onSubmit={subscribe}>
            <label className="sr-only" htmlFor="store-newsletter-email">{copy.placeholder}</label>
            <input id="store-newsletter-email" name="email" type="email" required autoComplete="email" placeholder={copy.placeholder} value={emailEdited ? email ?? "" : email ?? customer?.email ?? ""} onChange={(event) => { setEmailEdited(true); setEmail(event.target.value); }} />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : copy.submit}</button>
          </form>
        )}
        {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      </div>
      <div className="store-newsletter-brand"><strong>PONYO</strong><span>{copy.tagline}</span></div>
    </section>
  );
}
