"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { useLocalization } from "@/components/layout/localization-provider";
import { ponyoApi } from "@/services/ponyo-api.client";
import type { CartItem } from "@/lib/cart";
import type { Product } from "@/types/product";

type ProductCardActionProps = {
  product: Product;
  productName: string;
};

function ProductActionIcon({ type }: { type: "bag" | "email" }) {
  return type === "bag"
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9h15l1 11h-17l1-11Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8 9V6.8a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9 13h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m4.5 7 7.5 5.8L19.5 7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="m17.5 3 .65 1.35L19.5 5l-1.35.65L17.5 7l-.65-1.35L15.5 5l1.35-.65L17.5 3Z" fill="currentColor"/></svg>;
}

export function ProductCardAction({ product, productName }: ProductCardActionProps) {
  const { customer, isLoading } = useCustomerSession();
  const { t } = useLocalization();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedVariant = product.variants?.find((variant) => variant.availability === "available")
    ?? product.variants?.[0];
  const needsNotify = product.availability !== "available"
    || ["Coming Soon", "Waitlist", "Unavailable"].includes(product.availabilityStatus ?? "");

  useEffect(() => {
    if (!dialogOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDialogOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  function addToCart() {
    const image = typeof product.image === "string" ? product.image : product.image.src;
    const item: CartItem = {
      id: selectedVariant?.id ?? product.variantId ?? product.id,
      catalogId: product.id,
      variantId: selectedVariant?.id ?? product.variantId,
      slug: product.slug,
      name: productName,
      maker: product.supplierName,
      price: selectedVariant?.priceAmount ?? product.priceAmount,
      currency: selectedVariant?.currency ?? product.currency,
      image,
      imageAlt: product.imageAlt,
      qty: 1,
    };
    window.dispatchEvent(new CustomEvent("ponyo:add-to-cart", { detail: item }));
  }

  async function notify(emailAddress: string, firstName: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.joinProductWaitlist(product.id, { email: emailAddress.trim(), firstName });
      setMessage(t("product.waitlist.success", "You’re on the list! We’ll email you when it’s available."));
      setDialogOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("product.waitlist.error", "We couldn’t save your request. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function handleNotify() {
    if (customer) {
      void notify(customer.email, customer.firstName);
      return;
    }
    setEmail("");
    setError("");
    setDialogOpen(true);
  }

  function submitGuestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void notify(email, "");
  }

  return (
    <div className="product-card-action-wrap">
      {needsNotify ? (
        <button className="product-card-action is-notify" type="button" onClick={handleNotify} disabled={saving || isLoading || Boolean(message)}>
          <span className="product-card-action-label">{saving ? t("product.waitlist.saving", "Saving…") : message ? t("product.waitlist.joined", "You’re on the list") : t("product.action.notify_me", "Notify me")}</span>
          <span className="product-card-action-icon is-email"><ProductActionIcon type="email" /></span>
        </button>
      ) : (
        <button className="product-card-action is-cart" type="button" onClick={addToCart} disabled={product.availability !== "available" || !selectedVariant || selectedVariant.availability !== "available" || selectedVariant.previewOnly}>
          <span className="product-card-action-label">{t("product.action.add_to_cart", "Add to cart")}</span>
          <span className="product-card-action-icon is-bag"><ProductActionIcon type="bag" /></span>
        </button>
      )}
      {message && <span className="product-card-action-message" role="status">{message}</span>}
      {error && !dialogOpen && <span className="product-card-action-message is-error" role="alert">{error}</span>}

      {dialogOpen && createPortal(<div className="product-notify-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
        <section className="product-notify-dialog" role="dialog" aria-modal="true" aria-labelledby={`notify-title-${product.id}`}>
          <button type="button" className="product-notify-close" aria-label={t("general.close", "Close")} onClick={() => setDialogOpen(false)}>×</button>
          <span className="product-notify-sparkle" aria-hidden="true">✦</span>
          <p className="product-notify-eyebrow">{t("product.waitlist.eyebrow", "A little heads-up")}</p>
          <h2 id={`notify-title-${product.id}`}>{t("product.waitlist.title", "Be first to know")}</h2>
          <p>{t("product.waitlist.card_body", `Leave your email and we’ll let you know when ${productName} is ready.`, { product: productName })}</p>
          <form onSubmit={submitGuestEmail}>
            <label htmlFor={`notify-email-${product.id}`}>{t("product.waitlist.email", "Email address")}</label>
            <input id={`notify-email-${product.id}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required maxLength={320} autoFocus />
            {error && <p className="product-notify-error" role="alert">{error}</p>}
            <button type="submit" disabled={saving}>{saving ? t("product.waitlist.saving", "Saving…") : t("product.action.notify_me", "Notify me")} <span aria-hidden="true">→</span></button>
          </form>
          <small>{t("product.waitlist.privacy", "We’ll only use your email for this product availability alert.")}</small>
        </section>
      </div>, document.body)}
    </div>
  );
}
