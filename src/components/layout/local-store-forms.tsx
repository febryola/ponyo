"use client";

import { useState, type FormEvent } from "react";
import locale from "@/ponyo-shopify/locales/en.default.json";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

export function HomeInterestForms() {
  const [alertsJoined, setAlertsJoined] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = locale.home;

  function submit(type: "newsletter" | "request") {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError("");
      const formData = new FormData(event.currentTarget);
      setSubmitting(true);
      try {
        if (PONYO_API_BASE_URL) {
          if (type === "newsletter") {
            await ponyoApi.subscribeNewsletter(String(formData.get("email") ?? ""));
            setAlertsJoined(true);
          } else {
            await ponyoApi.submitContactRequest({
              name: String(formData.get("name") ?? ""),
              email: String(formData.get("email") ?? ""),
              message: String(formData.get("message") ?? ""),
              requestType: "Plush request",
            });
            setRequestSent(true);
          }
        } else if (type === "newsletter") setAlertsJoined(true);
        else setRequestSent(true);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Unable to submit this form.");
      } finally {
        setSubmitting(false);
      }
    };
  }

  return (
    <section className="home-forms store-container" id="drops" aria-label="Rare drop alerts and plush requests">
      <div className="rare-drop-form-panel">
        <span className="form-sparkle" aria-hidden="true">✦</span>
        <h2>{copy.v2.drops_title}</h2>
        <p>{copy.v2.drops_body}</p>
        {alertsJoined ? <p className="local-form-success" role="status">{copy.v2.drops_success}</p> : (
          <form onSubmit={submit("newsletter")}>
            <label className="sr-only" htmlFor="drops-email">{copy.v2.email_label}</label>
            <div><input id="drops-email" name="email" type="email" required autoComplete="email" placeholder={copy.v2.email_placeholder} /><button type="submit" disabled={submitting}>{submitting ? "Please wait…" : copy.v2.drops_cta}</button></div>
            {formError && !alertsJoined && <p className="api-form-error" role="alert">{formError}</p>}
          </form>
        )}
      </div>
      <div className="plush-request-panel">
        <h2>{copy.v2.request_title}</h2>
        <p>{copy.v2.request_body}</p>
        {requestSent ? <p className="local-form-success" role="status">{copy.v2.request_success}</p> : (
          <form onSubmit={submit("request")}>
            <div>
              <label className="sr-only" htmlFor="request-name">{copy.v2.name_label}</label>
              <input id="request-name" name="name" autoComplete="name" placeholder={copy.v2.name_label} />
              <label className="sr-only" htmlFor="request-email">{copy.v2.email_label}</label>
              <input id="request-email" name="email" type="email" required autoComplete="email" placeholder={copy.v2.email_placeholder} />
            </div>
            <label className="sr-only" htmlFor="request-body">{copy.v2.request_label}</label>
            <textarea id="request-body" name="message" required rows={3} placeholder={copy.v2.request_placeholder} />
            <button type="submit" disabled={submitting}>{submitting ? "Please wait…" : copy.v2.request_cta}</button>
            {formError && !requestSent && <p className="api-form-error" role="alert">{formError}</p>}
          </form>
        )}
      </div>
    </section>
  );
}

export function LocalContactForm() {
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (sent) return <p className="local-form-success contact-success" role="status">Thanks for reaching out. Your message is saved in this preview.</p>;

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      setSubmitting(true);
      setErrorMessage("");
      const data = new FormData(event.currentTarget);
      try {
        if (PONYO_API_BASE_URL) await ponyoApi.submitContactRequest({ name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), message: String(data.get("message") ?? "") });
        setSent(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to send this message.");
      } finally { setSubmitting(false); }
    }}>
      <label htmlFor="contact-name">Name <span>*</span></label>
      <input id="contact-name" name="name" required autoComplete="name" />
      <label htmlFor="contact-email">Email <span>*</span></label>
      <input id="contact-email" name="email" type="email" required autoComplete="email" />
      <label htmlFor="contact-phone">Phone</label>
      <input id="contact-phone" name="phone" type="tel" autoComplete="tel" />
      <label htmlFor="contact-message">Message <span>*</span></label>
      <textarea id="contact-message" name="message" rows={6} required />
      {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      <button className="shop-button shop-button-orange" type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send message"}</button>
    </form>
  );
}
