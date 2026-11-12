"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import locale from "@/locales/en.default.json";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { useLocalization } from "@/components/layout/localization-provider";

export function HomeInterestForms() {
  const [alertsJoined, setAlertsJoined] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestOutcome, setRequestOutcome] = useState<"preview" | "saved-notified" | "saved-no-email" | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState<string | null>(null);
  const [requestName, setRequestName] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState<string | null>(null);
  const { customer } = useCustomerSession();
  const { t } = useLocalization();
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
            const result = await ponyoApi.submitContactRequest({
              name: String(formData.get("name") ?? ""),
              email: String(formData.get("email") ?? ""),
              message: String(formData.get("message") ?? ""),
              requestType: "Plush request",
            });
            setRequestOutcome(result.emailNotificationSent ? "saved-notified" : "saved-no-email");
            setRequestSent(true);
          }
        } else if (type === "newsletter") setAlertsJoined(true);
        else {
          setRequestOutcome("preview");
          setRequestSent(true);
        }
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
        <h2>{t("home.forms.drops_title", copy.v2.drops_title)}</h2>
        <p>{t("home.forms.drops_body", copy.v2.drops_body)}</p>
        {alertsJoined ? <p className="local-form-success" role="status">{t("home.forms.drops_success", copy.v2.drops_success)}</p> : (
          <form onSubmit={submit("newsletter")}>
            <label className="sr-only" htmlFor="drops-email">{t("home.forms.email_label", copy.v2.email_label)}</label>
            <div><input id="drops-email" name="email" type="email" required autoComplete="email" placeholder={t("home.forms.email_placeholder", copy.v2.email_placeholder)} value={newsletterEmail ?? customer?.email ?? ""} onChange={(event) => setNewsletterEmail(event.target.value)} /><button type="submit" disabled={submitting}>{submitting ? t("home.forms.wait", "Please wait…") : t("home.forms.drops_cta", copy.v2.drops_cta)}</button></div>
            {formError && !alertsJoined && <p className="api-form-error" role="alert">{formError}</p>}
          </form>
        )}
      </div>
      <div className="plush-request-panel">
        <h2>{t("home.forms.request_title", copy.v2.request_title)}</h2>
        <p>{t("home.forms.request_body", copy.v2.request_body)}</p>
        {requestSent ? <p className="local-form-success" role="status">{requestOutcome === "saved-notified" ? "Your request is saved, and an email notification was sent to Ponyo." : requestOutcome === "saved-no-email" ? "Your request is saved in the Ponyo database. Email notification is not set up yet." : "Preview only: this request was not sent to the backend or by email."}</p> : (
          <form onSubmit={submit("request")}>
            <div>
              <label className="sr-only" htmlFor="request-name">{t("home.forms.name_label", copy.v2.name_label)}</label>
              <input id="request-name" name="name" autoComplete="name" placeholder={t("home.forms.name_label", copy.v2.name_label)} value={requestName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" ")} onChange={(event) => setRequestName(event.target.value)} />
              <label className="sr-only" htmlFor="request-email">{t("home.forms.email_label", copy.v2.email_label)}</label>
              <input id="request-email" name="email" type="email" required autoComplete="email" placeholder={t("home.forms.email_placeholder", copy.v2.email_placeholder)} value={requestEmail ?? customer?.email ?? ""} onChange={(event) => setRequestEmail(event.target.value)} />
            </div>
            <label className="sr-only" htmlFor="request-body">{t("home.forms.request_label", copy.v2.request_label)}</label>
            <textarea id="request-body" name="message" required rows={3} placeholder={t("home.forms.request_placeholder", copy.v2.request_placeholder)} />
            <button type="submit" disabled={submitting}>{submitting ? t("home.forms.wait", "Please wait…") : t("home.forms.request_cta", copy.v2.request_cta)}</button>
            {formError && !requestSent && <p className="api-form-error" role="alert">{formError}</p>}
          </form>
        )}
      </div>
    </section>
  );
}

export function LocalContactForm() {
  const [sent, setSent] = useState(false);
  const [requestOutcome, setRequestOutcome] = useState<"preview" | "saved-notified" | "saved-no-email" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const { customer } = useCustomerSession();
  const { t } = useLocalization();
  const submitInFlight = useRef(false);
  const successCard = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!sent) return;
    // Let the keyboard blur and the shorter card's layout settle before scrolling.
    // Two frames also keep browser scroll anchoring from hiding the confirmation.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const card = successCard.current;
        if (!card) return;
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [sent]);

  const requestTypes: Record<string, string> = {
    order: "Order question",
    delivery: "Delivery question",
    plush: "Plush request",
    general: "General inquiry",
  };

  if (sent) return (
    <section ref={successCard} tabIndex={-1} className="contact-form-card contact-success" role="status" aria-live="polite" aria-labelledby="contact-success-title" aria-describedby="contact-success-description">
      <div className="contact-success-art" aria-hidden="true">
        <svg className="contact-success-halo" width="220" height="150" viewBox="0 0 220 150" fill="none" aria-hidden="true" focusable="false">
          <ellipse cx="110" cy="75" rx="97" ry="58" stroke="currentColor" strokeDasharray="3 8" />
          <path d="m30 30 3 8 8 3-8 3-3 8-3-8-8-3 8-3Zm155 65 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="currentColor" />
          <circle cx="180" cy="35" r="5" fill="currentColor" /><circle cx="47" cy="115" r="3" fill="currentColor" />
        </svg>
        <span className="contact-success-medallion">
          <svg className="contact-success-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
            {requestOutcome === "preview"
              ? <path d="M14 12h20v26H14zM20 20h8m-8 6h8m-8 6h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="m13 24 7 7 15-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </span>
      </div>
      <h2 id="contact-success-title">{requestOutcome === "preview" ? t("contact.preview_title", "Your note is in preview") : t("contact.saved_title", "Your note is saved")}</h2>
      <p id="contact-success-description">{requestOutcome === "saved-notified"
        ? t("contact.saved_notified", "Your message is saved, and an email notification was sent to Ponyo.")
        : requestOutcome === "saved-no-email"
          ? t("contact.saved_no_email", "Your message is saved. Email notification could not be sent; the Ponyo team can still find your note.")
          : t("contact.preview", "Preview only: your message was not sent to the backend or by email.")}</p>
      <div className="contact-success-footer">
        <Link href="/pages/faq">{t("contact.faq_cta", "Explore FAQs")} <span aria-hidden="true">↗</span></Link>
      </div>
    </section>
  );

  return (
    <section className="contact-form-card" aria-labelledby="contact-form-title">
      <div className="contact-form-heading">
        <svg className="contact-mail-icon" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true" focusable="false">
          <rect x="5" y="10" width="34" height="25" rx="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="m7 13 15 11 15-11M6 33l10-10m22 10L28 23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 6v-3m-7 4-2-2m16 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <p className="contact-form-kicker">{t("contact.form_kicker", "A NOTE TO PONYO")}</p>
        <h2 id="contact-form-title">{t("contact.form_title", "Send a little note")}</h2>
        <p id="contact-required-note">{t("contact.required_note", "Fields marked * are required. The rest is up to you.")}</p>
      </div>
      <form className="contact-message-form" aria-describedby="contact-required-note" aria-busy={submitting} onSubmit={async (event) => {
      event.preventDefault();
      if (submitting || submitInFlight.current) return;
      submitInFlight.current = true;
      setSubmitting(true);
      setErrorMessage("");
      const form = event.currentTarget;
      try {
        const data = new FormData(form);
        const name = String(data.get("name") ?? "");
        const phone = String(data.get("phone") ?? "").trim();
        const body = String(data.get("message") ?? "");
        const message = phone ? `${body}\nPhone: ${phone}` : body;
        if (name.length > 160 || phone.length > 60 || body.length > 4800 || message.length > 5000) {
          setErrorMessage(t("contact.error_length", "Please keep your name under 160 characters, phone under 60, and message under 4,800."));
          return;
        }
        if (PONYO_API_BASE_URL) {
          const topic = String(data.get("topic") ?? "general");
          const result = await ponyoApi.submitContactRequest({
            name,
            email: String(data.get("email") ?? ""),
            message,
            requestType: Object.hasOwn(requestTypes, topic) ? requestTypes[topic] : requestTypes.general,
          });
          setRequestOutcome(result.emailNotificationSent ? "saved-notified" : "saved-no-email");
        } else setRequestOutcome("preview");
        // Dismiss a mobile keyboard before removing its focused form control.
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && form.contains(activeElement)) activeElement.blur();
        setSent(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("contact.error_send", "Unable to send this message. Please try again; your note is still here."));
      } finally {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    }}>
      <div className="contact-field-grid">
        <div className="contact-field">
          <label htmlFor="contact-name">{t("contact.name", "Name")} <span aria-hidden="true">*</span></label>
          <input id="contact-name" name="name" required maxLength={160} autoComplete="name" value={contactName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" ")} onChange={(event) => setContactName(event.target.value)} />
        </div>
        <div className="contact-field">
          <label htmlFor="contact-email">{t("contact.email", "Email")} <span aria-hidden="true">*</span></label>
          <input id="contact-email" name="email" type="email" required autoComplete="email" value={contactEmail ?? customer?.email ?? ""} onChange={(event) => setContactEmail(event.target.value)} />
        </div>
      </div>
      <div className="contact-field">
        <label htmlFor="contact-phone">{t("contact.phone", "Phone")} <span>{t("contact.optional", "(optional)")}</span></label>
        <input id="contact-phone" name="phone" type="tel" autoComplete="tel" maxLength={60} />
      </div>
      <div className="contact-field">
        <label htmlFor="contact-topic">{t("contact.topic", "What’s your note about?")}</label>
        <select id="contact-topic" name="topic" defaultValue="general">
          <option value="order">{t("contact.topic_order", "An order")}</option>
          <option value="delivery">{t("contact.topic_delivery", "Delivery")}</option>
          <option value="plush">{t("contact.topic_plush", "Finding a plush")}</option>
          <option value="general">{t("contact.topic_general", "Something else")}</option>
        </select>
      </div>
      <div className="contact-field">
        <label htmlFor="contact-message">{t("contact.message", "Message")} <span aria-hidden="true">*</span></label>
        <textarea id="contact-message" name="message" rows={5} required maxLength={4800} placeholder={t("contact.message_placeholder", "Tell us a little about how we can help…")} />
      </div>
      {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      <div className="contact-form-footer">
        <p className="contact-privacy-note">{t("contact.privacy", "Please only share the details we need to help. Never include passwords or payment details.")}</p>
        <button className="shop-button shop-button-orange" type="submit" disabled={submitting}>
          {submitting ? t("contact.sending", "Sending…") : t("contact.send", "Send message")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      </form>
    </section>
  );
}
