"use client";

import { useState, type FormEvent } from "react";
import { PONYO_API_BASE_URL, ponyoApi } from "@/services/ponyo-api.client";

type InquiryDetails = { company: string; email: string; emailNotificationSent: boolean };

export function PartnerInquiryForm() {
  const [submitted, setSubmitted] = useState<InquiryDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const company = String(values.get("company") ?? "").trim();
    const contactName = String(values.get("contactName") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const website = String(values.get("website") ?? "").trim();
    const productType = String(values.get("productType") ?? "").trim();
    const message = String(values.get("message") ?? "").trim();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      if (!PONYO_API_BASE_URL) {
        setErrorMessage("The partnership form needs the local Ponyo API to save submissions.");
        return;
      }
      const result = await ponyoApi.submitContactRequest({
        name: contactName,
        email,
        requestType: "Supplier partnership",
        message: [
          `Company / maker: ${company}`,
          `Website: ${website || "Not provided"}`,
          `Product category: ${productType}`,
          "Partnership note:",
          message,
        ].join("\n"),
      });
      setSubmitted({ company, email, emailNotificationSent: result.emailNotificationSent });
      form.reset();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit your partnership inquiry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="partner-form-success" role="status">
        <span aria-hidden="true">✿</span>
        <h2>Thank you, {submitted.company}.</h2>
        <p>Your partnership inquiry has been saved with contact email <strong>{submitted.email}</strong>. {submitted.emailNotificationSent ? "A notification was emailed to Ponyo." : "Ponyo email notifications are not configured yet."}</p>
      </div>
    );
  }

  return (
    <form className="partner-inquiry-form" onSubmit={handleSubmit}>
      <div className="partner-form-grid">
        <label>Company or maker name <span>*</span><input name="company" required maxLength={160} autoComplete="organization" placeholder="Your studio or brand" /></label>
        <label>Contact name <span>*</span><input name="contactName" required maxLength={160} autoComplete="name" placeholder="Your name" /></label>
        <label>Business email <span>*</span><input name="email" type="email" required maxLength={320} autoComplete="email" placeholder="you@yourstudio.com" /></label>
        <label>Website or social link<input name="website" type="url" maxLength={500} placeholder="https://" /></label>
      </div>
      <label>What do you make? <span>*</span>
        <select name="productType" required defaultValue="">
          <option value="" disabled>Select a product category</option>
          <option>Plush toys</option>
          <option>Collectible characters</option>
          <option>Handmade or limited-edition plush</option>
          <option>Other</option>
        </select>
      </label>
      <label>Tell us about your products and partnership idea <span>*</span><textarea name="message" required minLength={20} maxLength={4000} rows={6} placeholder="Share your product range, where you make it, and how you would like to work with Ponyo." /></label>
      {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      <button className="shop-button shop-button-orange" type="submit" disabled={isSubmitting}>{isSubmitting ? "Sending inquiry…" : "Send partnership inquiry"}<span aria-hidden="true">→</span></button>
      <p className="partner-form-privacy">Your details will only be used to review this partnership inquiry.</p>
    </form>
  );
}
