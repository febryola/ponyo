"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCartItems, saveCart } from "@/lib/cart";
import { saveLocalOrder } from "@/lib/local-orders";
import { formatPrice } from "@/lib/utils/format-price";
import { ApiNotConfiguredError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

type CheckoutStep = 0 | 1 | 2;
type PaymentMethod = "card" | "paypal" | "apple";

const shippingOptions = [
  { id: "standard", name: "Standard delivery", detail: "5–8 business days", price: 0 },
  { id: "express", name: "Express delivery", detail: "2–4 business days", price: 1200 },
] as const;

export function CheckoutPageClient() {
  const items = useCartItems();
  const [step, setStep] = useState<CheckoutStep>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [shipping, setShipping] = useState<(typeof shippingOptions)[number]["id"]>("standard");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState({ firstName: "", lastName: "", address: "", city: "", postal: "", country: "Japan" });
  const [placedOrder, setPlacedOrder] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currency = items[0]?.currency ?? "JPY";
  const deliveryPrice = shippingOptions.find((option) => option.id === shipping)?.price ?? 0;
  const total = subtotal + deliveryPrice;

  function continueToPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function placeLocalOrder() {
    setApiError("");
    if (PONYO_API_BASE_URL) {
      const checkoutItems = items.map((item) => item.variantId ? { variantId: item.variantId, quantity: item.qty } : null);
      if (checkoutItems.some((item) => item === null)) {
        setApiError("One or more items need a live variant ID before backend checkout can start. Refresh the catalog and try again.");
        return;
      }
      setIsSubmitting(true);
      try {
        const session = await ponyoApi.createCheckoutSession({
          email,
          shippingAddress: {
            firstName: delivery.firstName,
            lastName: delivery.lastName,
            address1: delivery.address,
            city: delivery.city,
            postalCode: delivery.postal,
            countryCode: delivery.country === "United States" ? "US" : delivery.country === "United Kingdom" ? "GB" : delivery.country === "Australia" ? "AU" : delivery.country === "Canada" ? "CA" : "JP",
          },
          shippingMethod: shipping,
          paymentMethod: paymentMethod === "apple" ? "apple_pay" : paymentMethod,
          items: checkoutItems.filter((item): item is { variantId: string; quantity: number } => item !== null),
          successUrl: `${window.location.origin}/orders?checkout=success`,
          cancelUrl: `${window.location.origin}/checkout?checkout=cancelled`,
        });
        const checkoutUrl = new URL(session.checkoutUrl);
        if (checkoutUrl.protocol !== "https:" && checkoutUrl.origin !== window.location.origin) throw new Error("The payment service returned an invalid checkout URL.");
        window.location.assign(checkoutUrl.toString());
      } catch (error) {
        setApiError(error instanceof ApiNotConfiguredError ? "Checkout service is not configured." : error instanceof Error ? error.message : "Unable to start checkout.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const id = `PNY-${Date.now().toString().slice(-8)}`;
    saveLocalOrder({
      id,
      createdAt: new Date().toISOString(),
      status: "Confirmed",
      payment: paymentMethod,
      customerEmail: email,
      deliveryAddress: `${delivery.firstName} ${delivery.lastName}, ${delivery.address}, ${delivery.city} ${delivery.postal}, ${delivery.country}`,
      total,
      currency,
      items,
    });
    saveCart([]);
    window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: [] }));
    setPlacedOrder(id);
  }

  if (placedOrder) {
    return (
      <section className="checkout-complete" aria-labelledby="checkout-complete-title">
        <span className="checkout-complete-icon" aria-hidden="true">✓</span>
        <p className="account-auth-eyebrow">ORDER CONFIRMED</p>
        <h1 id="checkout-complete-title">Your plush is on its way.</h1>
        <p>Your preview order <strong>{placedOrder}</strong> has been saved on this device.</p>
        <div><Link className="shop-button shop-button-orange" href="/orders">View order history <b>→</b></Link><Link className="checkout-back-link" href="/collections/all">Continue shopping</Link></div>
        <small>This is a frontend checkout preview. No payment was collected.</small>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="checkout-empty">
        <span aria-hidden="true">♡</span>
        <h1>Your bag is waiting for a plush friend.</h1>
        <p>Add a plush to your bag, then come back to finish your order preview.</p>
        <Link className="shop-button shop-button-orange" href="/collections/all">Browse all plush <b>→</b></Link>
      </section>
    );
  }

  return (
    <div className="checkout-flow">
      <div className="checkout-flow-heading">
        <div><p className="eyebrow">A LITTLE BUNDLE OF JOY</p><h1>Checkout</h1></div>
        <span className="checkout-secure-note"><span aria-hidden="true">♧</span> Secure checkout preview</span>
      </div>

      <ol className="checkout-steps" aria-label="Checkout steps">
        {["Delivery", "Payment", "Review"].map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><span>{index < step ? "✓" : index + 1}</span><b>{label}</b></li>)}
      </ol>

      <div className="checkout-columns">
        <div className="checkout-main-panel">
          {step === 0 && <form className="checkout-form" onSubmit={continueToPayment}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>01</span><div><h2>Contact</h2><p>Where should we send your order updates?</p></div></div>
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>02</span><div><h2>Delivery address</h2><p>Enter the address where your new friend will arrive.</p></div></div>
              <div className="checkout-field-grid">
                <label>First name<input name="first-name" autoComplete="given-name" placeholder="First name" value={delivery.firstName} onChange={(event) => setDelivery({ ...delivery, firstName: event.target.value })} required /></label>
                <label>Last name<input name="last-name" autoComplete="family-name" placeholder="Last name" value={delivery.lastName} onChange={(event) => setDelivery({ ...delivery, lastName: event.target.value })} required /></label>
              </div>
              <label>Address<input name="address" autoComplete="street-address" placeholder="Street address" value={delivery.address} onChange={(event) => setDelivery({ ...delivery, address: event.target.value })} required /></label>
              <div className="checkout-field-grid checkout-field-grid-city"><label>City<input name="city" autoComplete="address-level2" placeholder="City" value={delivery.city} onChange={(event) => setDelivery({ ...delivery, city: event.target.value })} required /></label><label>Postal code<input name="postal" autoComplete="postal-code" placeholder="Postal code" value={delivery.postal} onChange={(event) => setDelivery({ ...delivery, postal: event.target.value })} required /></label></div>
              <label>Country or region<select name="country" value={delivery.country} onChange={(event) => setDelivery({ ...delivery, country: event.target.value })}><option>Japan</option><option>United States</option><option>United Kingdom</option><option>Australia</option><option>Canada</option></select></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>03</span><div><h2>Delivery method</h2><p>Choose how quickly your plush should travel.</p></div></div>
              <div className="checkout-choice-list">{shippingOptions.map((option) => <label className={`checkout-choice${shipping === option.id ? " is-selected" : ""}`} key={option.id}><input type="radio" name="shipping" value={option.id} checked={shipping === option.id} onChange={() => setShipping(option.id)} /><span><b>{option.name}</b><small>{option.detail}</small></span><strong>{option.price ? formatPrice(option.price, currency) : "Complimentary"}</strong></label>)}</div>
            </section>
            <button type="submit" className="checkout-primary-button">Continue to payment <span aria-hidden="true">→</span></button>
          </form>}

          {step === 1 && <form className="checkout-form" onSubmit={continueToReview}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>04</span><div><h2>Payment method</h2><p>Choose a payment option for this preview.</p></div></div>
              <div className="checkout-choice-list checkout-payment-list">
                <label className={`checkout-choice${paymentMethod === "card" ? " is-selected" : ""}`}><input type="radio" name="payment" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /><span><b>Credit or debit card</b><small>Visa · Mastercard · Amex</small></span><span className="checkout-payment-icons">VISA&nbsp; MC</span></label>
                <label className={`checkout-choice${paymentMethod === "paypal" ? " is-selected" : ""}`}><input type="radio" name="payment" checked={paymentMethod === "paypal"} onChange={() => setPaymentMethod("paypal")} /><span><b>PayPal</b><small>Pay with your PayPal account</small></span><strong className="payment-wordmark paypal-wordmark">PayPal</strong></label>
                <label className={`checkout-choice${paymentMethod === "apple" ? " is-selected" : ""}`}><input type="radio" name="payment" checked={paymentMethod === "apple"} onChange={() => setPaymentMethod("apple")} /><span><b>Apple Pay</b><small>Quick and secure checkout</small></span><strong className="payment-wordmark">Pay</strong></label>
              </div>
              <p className="checkout-preview-disclaimer">Payment details are entered on the secure payment provider page. This store never handles card numbers.</p>
            </section>
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(0)}>← Back to delivery</button><button type="submit" className="checkout-primary-button">Review order <span aria-hidden="true">→</span></button></div>
          </form>}

          {step === 2 && <section className="checkout-review-panel">
            <div className="checkout-section-heading"><span>05</span><div><h2>Review your order</h2><p>Everything looks good? Place your local preview order.</p></div></div>
            <div className="checkout-review-block"><div><strong>Contact</strong><button type="button" onClick={() => setStep(0)}>Edit</button></div><p>{email}</p></div>
            <div className="checkout-review-block"><div><strong>Delivery</strong><button type="button" onClick={() => setStep(0)}>Edit</button></div><p>{delivery.firstName} {delivery.lastName}<br />{delivery.address}<br />{delivery.city} {delivery.postal}, {delivery.country}<br />{shippingOptions.find((option) => option.id === shipping)?.name}</p></div>
            <div className="checkout-review-block"><div><strong>Payment</strong><button type="button" onClick={() => setStep(1)}>Edit</button></div><p>{paymentMethod === "card" ? "Credit or debit card" : paymentMethod === "paypal" ? "PayPal" : "Apple Pay"}</p></div>
            {apiError && <p className="api-form-error" role="alert">{apiError}</p>}
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(1)}>← Back to payment</button><button type="button" className="checkout-primary-button" onClick={placeLocalOrder} disabled={isSubmitting}>{isSubmitting ? "Starting checkout…" : PONYO_API_BASE_URL ? "Continue to secure payment" : "Place preview order"}<span aria-hidden="true">→</span></button></div>
            {!PONYO_API_BASE_URL && <p className="checkout-preview-disclaimer">This local preview does not collect payment details.</p>}
          </section>}
        </div>

        <aside className="checkout-order-card" aria-label="Order summary">
          <div className="checkout-order-heading"><h2>Your order</h2><span>{items.reduce((sum, item) => sum + item.qty, 0)} items</span></div>
          <div className="checkout-order-items">{items.map((item) => <div className="checkout-order-item" key={item.id}><span className="checkout-order-image"><Image src={item.image} alt={item.imageAlt} fill sizes="72px"/><b>{item.qty}</b></span><span className="checkout-order-item-copy"><strong>{item.name}</strong><small>{item.maker}</small></span><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>
          <div className="checkout-totals"><div><span>Subtotal</span><strong>{formatPrice(subtotal, currency)}</strong></div><div><span>Delivery</span><strong>{deliveryPrice ? formatPrice(deliveryPrice, currency) : "Complimentary"}</strong></div><div className="checkout-grand-total"><span>Total</span><strong>{formatPrice(total, currency)}</strong></div></div>
          <p className="checkout-order-note"><span aria-hidden="true">♡</span> A little bundle of joy, packed with care.</p>
        </aside>
      </div>
    </div>
  );
}