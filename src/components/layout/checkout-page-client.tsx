"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useCartItems, saveCart, type CartItem } from "@/lib/cart";
import { saveLocalOrder } from "@/lib/local-orders";
import { useLocalization } from "@/components/layout/localization-provider";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

type CheckoutStep = 0 | 1 | 2;
type PaymentMethod = "card" | "apple_pay" | "paypay" | "rakuten_pay" | "konbini" | "amazon_pay";

const shippingOptions = [
  { id: "standard", name: "Standard delivery", detail: "5–8 business days", price: 0 },
  { id: "express", name: "Express delivery", detail: "2–4 business days", price: 1200 },
] as const

function PaymentBrandMark({ brand }: { brand: string }) {
  const label: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    jcb: "JCB",
    amex: "American Express",
    apple_pay: "Apple Pay",
    paypay: "PayPay",
    rakuten_pay: "Rakuten Pay",
    konbini: "Konbini",
    amazon_pay: "Amazon Pay",
  };

  return <span className={`payment-brand-mark payment-brand-mark--${brand}`} role="img" aria-label={label[brand] ?? brand}>
    <svg viewBox={brand === "mastercard" ? "0 0 48 30" : brand === "jcb" ? "0 0 44 30" : "0 0 92 32"} aria-hidden="true">
      {brand === "visa" && <><rect width="92" height="32" rx="4" fill="#fff"/><text x="8" y="24" fill="#173a75" fontFamily="Arial,sans-serif" fontSize="25" fontStyle="italic" fontWeight="900">VISA</text></>}
      {brand === "mastercard" && <><circle cx="18" cy="15" r="13" fill="#eb001b"/><circle cx="30" cy="15" r="13" fill="#f79e1b"/><path d="M24 5.2a13 13 0 0 1 0 19.6 13 13 0 0 1 0-19.6Z" fill="#ff5f00"/></>}
      {brand === "jcb" && <><rect x="1" y="2" width="13" height="26" rx="2" fill="#0b4ea2"/><rect x="15.5" y="2" width="13" height="26" rx="2" fill="#d71920"/><rect x="30" y="2" width="13" height="26" rx="2" fill="#168943"/><text x="3" y="20" fill="white" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="900">J</text><text x="17" y="20" fill="white" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="900">C</text><text x="32" y="20" fill="white" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="900">B</text></>}
      {brand === "amex" && <><rect width="92" height="32" rx="4" fill="#176fc1"/><text x="8" y="14" fill="white" fontFamily="Arial,sans-serif" fontSize="9" fontWeight="900">AMERICAN</text><text x="8" y="26" fill="white" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="900">EXPRESS</text></>}
      {brand === "apple_pay" && <><path d="M21 7c1.8-2.1 1.6-4.1 1.6-4.1S20.4 3 19 4.7c-1.3 1.5-1.7 3.2-1.7 3.2S19.4 8.6 21 7Zm-2.1 2.2c-2.1 0-3 .9-4.4.9-1.1 0-2.3-.9-4.2-.9-3.1 0-6.1 2.6-6.1 7.1 0 3.8 3.2 9.8 6.1 9.8 1.2 0 2.1-.8 4-.8 1.8 0 2.4.8 3.8.8 3.1 0 5.9-5.8 5.9-6.1 0 0-3.7-1.4-3.7-5.1 0-3.1 3-4.4 3.1-4.5-1.5-1.8-3.2-2.2-4.5-2.2Z" fill="#202124"/><text x="39" y="22" fill="#202124" fontFamily="Arial,sans-serif" fontSize="18" fontWeight="700">Pay</text></>}
      {brand === "paypay" && <><circle cx="15" cy="16" r="11" fill="#e60033"/><circle cx="25" cy="16" r="11" fill="#1769aa"/><text x="39" y="22" fill="#263746" fontFamily="Arial,sans-serif" fontSize="17" fontWeight="800">PayPay</text></>}
      {brand === "rakuten_pay" && <><path d="M5 5h20v5H12v4h11v5H12v8H5V5Z" fill="#bf0000"/><text x="30" y="14" fill="#bf0000" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="800">Rakuten</text><text x="30" y="26" fill="#333" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="700">Pay</text></>}
      {brand === "konbini" && <><path d="M6 13h23v15H6z" fill="#fff" stroke="#315d86" strokeWidth="1.6"/><path d="M4 13 8 5h19l4 8H4Z" fill="#e7f2fb" stroke="#315d86" strokeWidth="1.6"/><path d="M8 5v8m6-8v8m7-8v8m6-8v8" stroke="#c33d3d" strokeWidth="2.5"/><path d="M14 19h7v9h-7z" fill="#d9e9f4" stroke="#315d86" strokeWidth="1.2"/><text x="36" y="21" fill="#315d86" fontFamily="Arial,sans-serif" fontSize="12" fontWeight="800">Konbini</text></>}
      {brand === "amazon_pay" && <><text x="3" y="20" fill="#232f3e" fontFamily="Arial,sans-serif" fontSize="17" fontWeight="800">amazon</text><text x="61" y="20" fill="#232f3e" fontFamily="Arial,sans-serif" fontSize="13" fontWeight="700">pay</text><path d="M16 25c15 7 34 7 49-1" fill="none" stroke="#f3a847" strokeWidth="2.6" strokeLinecap="round"/><path d="m63 21 4 3-5 2" fill="none" stroke="#f3a847" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></>}
    </svg>
  </span>;
}

export function CheckoutPageClient({ buyNow = false }: { buyNow?: boolean }) {
  const router = useRouter();
  const { currency, country, deliveryCountries, formatPrice, convertMajorAmount } = useLocalization();
  const { customer } = useCustomerSession();
  const cartItems = useCartItems();
  const [buyNowItem, setBuyNowItem] = useState<CartItem | null>(null);
  const [buyNowReady, setBuyNowReady] = useState(!buyNow);
  useEffect(() => {
    if (!buyNow) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = window.sessionStorage.getItem("ponyo:buy-now-item");
        if (stored) setBuyNowItem(JSON.parse(stored) as CartItem);
      } catch {
        setBuyNowItem(null);
      } finally {
        setBuyNowReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [buyNow]);
  const items = buyNow ? (buyNowItem ? [buyNowItem] : []) : cartItems;
  const [step, setStep] = useState<CheckoutStep>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [shipping, setShipping] = useState<(typeof shippingOptions)[number]["id"]>("standard");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState({ firstName: "", lastName: "", address: "", address2: "", region: "", city: "", postal: "", phone: "", country: deliveryCountries.find((item) => item.code === country)?.label ?? "Japan" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [previewOffer, setPreviewOffer] = useState(false);
  const checkoutEmail = email || customer?.email || "";
  const checkoutDelivery = {
    ...delivery,
    firstName: delivery.firstName || customer?.firstName || "",
    lastName: delivery.lastName || customer?.lastName || "",
  };
  const catalogCurrency = items[0]?.currency ?? "JPY";
  const subtotal = convertMajorAmount(items.reduce((sum, item) => sum + item.price * item.qty, 0), catalogCurrency);
  const deliveryPrice = convertMajorAmount(shippingOptions.find((option) => option.id === shipping)?.price ?? 0, "JPY");
  const total = subtotal + deliveryPrice;

  const paymentOptions: Array<{ id: PaymentMethod; label: string; detail: string; brands?: string[]; enabled: boolean }> = [
    { id: "card", label: "Credit or debit card", detail: PONYO_API_BASE_URL ? "Secure card checkout when payment service is enabled" : "Demo checkout · cards are not charged", brands: ["visa", "mastercard", "jcb", "amex"], enabled: true },
    { id: "apple_pay", label: "Apple Pay", detail: PONYO_API_BASE_URL ? "Available on supported Apple devices" : "Demo checkout · no payment collected", brands: ["apple_pay"], enabled: true },
    { id: "paypay", label: "PayPay", detail: PONYO_API_BASE_URL ? "Available after Japan payment setup" : "Demo checkout · no payment collected", brands: ["paypay"], enabled: !PONYO_API_BASE_URL },
    { id: "rakuten_pay", label: "Rakuten Pay", detail: PONYO_API_BASE_URL ? "Available after Japan payment setup" : "Demo checkout · no payment collected", brands: ["rakuten_pay"], enabled: !PONYO_API_BASE_URL },
    { id: "konbini", label: "Konbini payment", detail: PONYO_API_BASE_URL ? "Available after Japan payment setup" : "Demo checkout · no payment collected", brands: ["konbini"], enabled: !PONYO_API_BASE_URL },
    { id: "amazon_pay", label: "Amazon Pay", detail: PONYO_API_BASE_URL ? "Available after payment integration" : "Demo checkout · no payment collected", brands: ["amazon_pay"], enabled: !PONYO_API_BASE_URL },
  ];

  useEffect(() => {
    if (!customer) return;
    let active = true;
    void ponyoApi.getAddresses().then((addresses) => {
      if (!active) return;
      const saved = addresses.find((address) => address.isDefault) ?? addresses[0];
      if (!saved) return;
      const countryLabel = deliveryCountries.find((item) => item.code === saved.countryCode)?.label;
      setDelivery((current) => ({
        ...current,
        firstName: current.firstName || saved.firstName,
        lastName: current.lastName || saved.lastName,
        address: current.address || saved.address1,
        address2: current.address2 || saved.address2,
        region: current.region || saved.region,
        city: current.city || saved.city,
        postal: current.postal || saved.postalCode,
        phone: current.phone || saved.phone,
        country: current.country === "Japan" || !current.country ? countryLabel ?? current.country : current.country,
      }));
    }).catch(() => { /* Guests and accounts without saved addresses can enter them below. */ });
    return () => { active = false; };
  }, [customer, deliveryCountries]);

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

  function placePreviewOrder() {
    const id = `PNY-${Date.now().toString().slice(-8)}`;
    const previewPayment = paymentOptions.find((option) => option.id === paymentMethod)?.label ?? "Credit or debit card";
    saveLocalOrder({
      id,
      createdAt: new Date().toISOString(),
      status: "Processing",
      payment: `Preview · ${previewPayment}`,
      customerEmail: checkoutEmail,
      deliveryAddress: [checkoutDelivery.firstName + " " + checkoutDelivery.lastName, checkoutDelivery.address, checkoutDelivery.address2, checkoutDelivery.region, checkoutDelivery.city, checkoutDelivery.postal, checkoutDelivery.country].filter(Boolean).join(", "),
      total,
      currency,
      trackingNumber: `JP${Date.now().toString().slice(-10)}`,
      trackingCarrier: "Japan Post · Demo tracking",
      items: items.map((item) => ({ ...item, price: convertMajorAmount(item.price, item.currency), currency })),
    });
    if (buyNow) window.sessionStorage.removeItem("ponyo:buy-now-item");
    else {
      saveCart([]);
      window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: [] }));
    }
    router.push(`/orders?preview=success&order_id=${encodeURIComponent(id)}`);
  }

  async function placeLocalOrder() {
    setApiError("");
    if (PONYO_API_BASE_URL) {
      if (paymentMethod !== "card" && paymentMethod !== "apple_pay") {
        setApiError("This payment method will be available when Japan payment processing is connected.");
        return;
      }
      const checkoutItems = items.map((item) => item.variantId ? { variantId: item.variantId, quantity: item.qty } : null);
      if (checkoutItems.some((item) => item === null)) {
        setApiError("One or more items need a live variant ID before backend checkout can start. Refresh the catalog and try again.");
        return;
      }
      setIsSubmitting(true);
      try {
        const session = await ponyoApi.createCheckoutSession({
          email: checkoutEmail,
          shippingAddress: {
            firstName: checkoutDelivery.firstName,
            lastName: checkoutDelivery.lastName,
            address1: checkoutDelivery.address,
            address2: checkoutDelivery.address2,
            region: checkoutDelivery.region,
            city: checkoutDelivery.city,
            postalCode: checkoutDelivery.postal,
            phone: checkoutDelivery.phone,
            countryCode: deliveryCountries.find((item) => item.label === checkoutDelivery.country)?.code ?? "JP",
          },
          shippingMethod: shipping,
          paymentMethod,
          currency,
          items: checkoutItems.filter((item): item is { variantId: string; quantity: number } => item !== null),
          successUrl: `${window.location.origin}/orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/checkout?checkout=cancelled`,
        });
        const checkoutUrl = new URL(session.checkoutUrl);
        if (checkoutUrl.protocol !== "https:") throw new Error("The payment service returned an invalid checkout URL.");
        if (buyNow) window.sessionStorage.removeItem("ponyo:buy-now-item");
        window.location.assign(checkoutUrl.toString());
      } catch (error) {
        setApiError(error instanceof ApiNotConfiguredError ? "Checkout service is not configured." : error instanceof Error ? error.message : "Unable to start checkout.");
        setPreviewOffer(error instanceof ApiRequestError && error.status === 503);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    placePreviewOrder();
  }

  if (!buyNowReady) return <section className="checkout-empty" role="status"><p>Preparing your plush for checkout…</p></section>;

  if (items.length === 0) {
    return (
      <section className="checkout-empty">
        <span aria-hidden="true">♡</span>
        <h1>Your bag is waiting for a plush friend.</h1>
        <p>Add a plush to your bag, then come back to finish your order.</p>
        <Link className="shop-button shop-button-orange" href="/collections/all">Browse all plush <b>→</b></Link>
      </section>
    );
  }

  return (
    <div className="checkout-flow">
      <div className="checkout-flow-heading">
        <div><p className="eyebrow">A LITTLE BUNDLE OF JOY</p><h1>Checkout</h1></div>
        <span className="checkout-secure-note"><span aria-hidden="true">♧</span> {PONYO_API_BASE_URL ? "Secure payment checkout" : "Demo checkout · no payment collected"}</span>
        <span className="checkout-jellyfish" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z"/><circle cx="26" cy="23" r="2.6"/><circle cx="38" cy="23" r="2.6"/><path d="M22 29c1.4 1.6 3 1.6 4.4 0M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10"/></svg></span>
      </div>

      <ol className="checkout-steps" aria-label="Checkout steps">
        {["Delivery", "Payment", "Review"].map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><span>{index < step ? "✓" : index + 1}</span><b>{label}</b></li>)}
      </ol>

      <div className="checkout-columns">
        <div className="checkout-main-panel">
          {step === 0 && <form className="checkout-form" onSubmit={continueToPayment}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>01</span><div><h2>Contact</h2><p>{customer ? "We’ve filled in your account details. You can change them for this order." : "Where should we send your order updates?"}</p></div></div>
              <label>Email address<input type="email" autoComplete="email" value={checkoutEmail} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>02</span><div><h2>Delivery address</h2><p>Enter the address where your new friend will arrive.</p></div></div>
              <div className="checkout-field-grid">
                <label>First name *<input name="first-name" autoComplete="given-name" placeholder="First name" value={checkoutDelivery.firstName} onChange={(event) => setDelivery({ ...delivery, firstName: event.target.value })} required /></label>
                <label>Last name *<input name="last-name" autoComplete="family-name" placeholder="Last name" value={checkoutDelivery.lastName} onChange={(event) => setDelivery({ ...delivery, lastName: event.target.value })} required /></label>
              </div>
              <label>Address *<input name="address" autoComplete="address-line1" placeholder="Street address" value={delivery.address} onChange={(event) => setDelivery({ ...delivery, address: event.target.value })} required /></label>
              <label>Apartment, suite, etc. (if applicable)<input name="address2" autoComplete="address-line2" placeholder="Building, apartment, room" value={delivery.address2} onChange={(event) => setDelivery({ ...delivery, address2: event.target.value })} /></label>
              <div className="checkout-field-grid checkout-field-grid-city"><label>City *<input name="city" autoComplete="address-level2" placeholder="City" value={delivery.city} onChange={(event) => setDelivery({ ...delivery, city: event.target.value })} required /></label><label>Prefecture / region *<input name="region" autoComplete="address-level1" placeholder="Tokyo" value={delivery.region} onChange={(event) => setDelivery({ ...delivery, region: event.target.value })} required /></label></div>
              <div className="checkout-field-grid checkout-field-grid-city"><label>Postal code *<input name="postal" autoComplete="postal-code" placeholder="Postal code" value={delivery.postal} onChange={(event) => setDelivery({ ...delivery, postal: event.target.value })} required /></label><label>Phone *<input name="phone" type="tel" autoComplete="tel" placeholder="For delivery updates" value={delivery.phone} onChange={(event) => setDelivery({ ...delivery, phone: event.target.value })} required /></label></div>
              <label>Country or region *<select name="country" value={delivery.country} onChange={(event) => setDelivery({ ...delivery, country: event.target.value })} required>{deliveryCountries.map((item) => <option key={item.code} value={item.label}>{item.label}</option>)}</select></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>03</span><div><h2>Delivery method</h2><p>Choose how quickly your plush should travel.</p></div></div>
              <div className="checkout-choice-list">{shippingOptions.map((option) => <label className={`checkout-choice${shipping === option.id ? " is-selected" : ""}`} key={option.id}><input type="radio" name="shipping" value={option.id} checked={shipping === option.id} onChange={() => setShipping(option.id)} /><span><b>{option.name}</b><small>{option.detail}</small></span><strong>{option.price ? formatPrice(option.price, "JPY") : "Complimentary"}</strong></label>)}</div>
            </section>
            <button type="submit" className="checkout-primary-button">Continue to payment <span aria-hidden="true">→</span></button>
          </form>}

          {step === 1 && <form className="checkout-form" onSubmit={continueToReview}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>04</span><div><h2>Payment method</h2><p>Choose a secure way to pay in Japan.</p></div></div>
              <div className="checkout-choice-list checkout-payment-list">
                {paymentOptions.map((option) => <label className={`checkout-choice checkout-payment-choice${paymentMethod === option.id ? " is-selected" : ""}${!option.enabled ? " is-coming-soon" : ""}`} key={option.id}>
                  <input type="radio" name="payment" value={option.id} checked={paymentMethod === option.id} disabled={!option.enabled} onChange={() => setPaymentMethod(option.id)} />
                  <span><b>{option.label}</b><small>{option.detail}</small>{option.brands && <span className="checkout-payment-icons">{option.brands.map((brand) => <PaymentBrandMark brand={brand} key={brand} />)}</span>}</span>
                  {!option.enabled && <strong className="checkout-coming-soon">Coming soon</strong>}
                </label>)}
              </div>
              <p className="checkout-preview-disclaimer">Card details are entered only on the secure payment page. Ponyo never stores your card number.</p>
            </section>
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(0)}>← Back to delivery</button><button type="submit" className="checkout-primary-button">Review order <span aria-hidden="true">→</span></button></div>
          </form>}

          {step === 2 && <section className="checkout-review-panel">
            <div className="checkout-section-heading"><span>05</span><div><h2>Review your order</h2><p>{PONYO_API_BASE_URL ? "Confirm your details, then continue to secure payment." : "Everything looks good? Place your local preview order."}</p></div></div>
            <div className="checkout-review-block"><div><strong>Contact</strong><button type="button" onClick={() => setStep(0)}>Edit</button></div><p>{checkoutEmail}</p></div>
            <div className="checkout-review-block"><div><strong>Delivery</strong><button type="button" onClick={() => setStep(0)}>Edit</button></div><p>{checkoutDelivery.firstName} {checkoutDelivery.lastName}<br />{checkoutDelivery.address}{checkoutDelivery.address2 && <><br />{checkoutDelivery.address2}</>}<br />{[checkoutDelivery.city, checkoutDelivery.region, checkoutDelivery.postal, checkoutDelivery.country].filter(Boolean).join(", ")}<br />{shippingOptions.find((option) => option.id === shipping)?.name}</p></div>
            <div className="checkout-review-block"><div><strong>Payment</strong><button type="button" onClick={() => setStep(1)}>Edit</button></div><p>{paymentOptions.find((option) => option.id === paymentMethod)?.label ?? "Credit or debit card"}</p></div>
            {apiError && <p className="api-form-error" role="alert">{apiError}</p>}
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(1)}>← Back to payment</button><button type="button" className="checkout-primary-button" onClick={placeLocalOrder} disabled={isSubmitting}>{isSubmitting ? "Starting checkout…" : PONYO_API_BASE_URL ? "Continue to secure payment" : "Place demo order"}<span aria-hidden="true">→</span></button></div>
            {previewOffer && <div className="checkout-preview-fallback"><p>Secure payment setup is not available yet. You can still complete a sample order to test order history and Japan Post tracking.</p><button type="button" className="checkout-secondary-button" onClick={placePreviewOrder}>Create sample order <span aria-hidden="true">→</span></button></div>}
            {!PONYO_API_BASE_URL && <p className="checkout-preview-disclaimer">Demo checkout only. No payment is collected.</p>}
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