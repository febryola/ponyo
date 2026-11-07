"use client";

import Image from "next/image";
import { useState } from "react";
import locale from "@/ponyo-shopify/locales/en.default.json";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

export function NewsletterPanel() {
  const [subscribed, setSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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
            <input id="store-newsletter-email" name="email" type="email" required autoComplete="email" placeholder={copy.placeholder} />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : copy.submit}</button>
          </form>
        )}
        {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      </div>
      <div className="store-newsletter-brand"><strong>PONYO</strong><span>{copy.tagline}</span></div>
    </section>
  );
}
