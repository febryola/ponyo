"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCartItems, readCart, saveCart, type CartItem } from "@/lib/cart";
import { refreshCartItems } from "@/lib/cart-validation";
import { saveLocalOrder } from "@/lib/local-orders";
import { useLocalization } from "@/components/layout/localization-provider";
import { regionName } from "@/lib/localization-options";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL, type CheckoutQuote, type CheckoutQuoteInput } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { AccountAuthForm } from "@/components/account/account-auth-form";

type CheckoutStep = 0 | 1 | 2;
type PaymentMethod = "card" | "apple_pay" | "paypay" | "rakuten_pay" | "konbini" | "amazon_pay";

// API totals are minor units. Do not convert a server quote using local FX rates.
function formatQuotedAmount(amount: number, currency: string) {
  const digits = currency === "JPY" || currency === "IDR" ? 0 : 2;
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  return formatter.format(amount / 10 ** digits);
}

function PaymentBrandMark({ brand }: { brand: string }) {
  const { t } = useLocalization();
  const label: Record<string, string> = {
    visa: t("checkout.brand_visa", "Visa"),
    mastercard: t("checkout.brand_mastercard", "Mastercard"),
    jcb: t("checkout.brand_jcb", "JCB"),
    amex: t("checkout.brand_amex", "American Express"),
    apple_pay: t("checkout.apple_pay", "Apple Pay"),
    paypay: t("checkout.paypay", "PayPay"),
    rakuten_pay: t("checkout.rakuten_pay", "Rakuten Pay"),
    konbini: t("checkout.brand_konbini", "Konbini"),
    amazon_pay: t("checkout.amazon_pay", "Amazon Pay"),
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
  const { t, language, currency, country, deliveryCountries, formatPrice, convertMajorAmount } = useLocalization();
  const shippingOptions = [
    { id: "standard", name: t("checkout.shipping_standard", "Standard delivery"), detail: t("checkout.shipping_standard_days", "5–8 business days"), price: 0 },
    { id: "express", name: t("checkout.shipping_express", "Express delivery"), detail: t("checkout.shipping_express_days", "2–4 business days"), price: 1200 },
  ] as const;
  const { customer, setCustomer, isLoading: sessionLoading } = useCustomerSession();
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
  const [couponCode, setCouponCode] = useState("");
  const [quoteState, setQuoteState] = useState<{ inputKey: string; quote: CheckoutQuote } | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const quoting = useRef(false);
  const submitting = useRef(false);
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const currentCurrency = useRef(currency);
  useEffect(() => { currentCurrency.current = currency; }, [currency]);
  const checkoutEmail = PONYO_API_BASE_URL ? customer?.email ?? "" : email;
  const checkoutDelivery = {
    ...delivery,
    firstName: delivery.firstName || customer?.firstName || "",
    lastName: delivery.lastName || customer?.lastName || "",
  };
  const deliveryCountryCode = deliveryCountries.find((item) => item.label === checkoutDelivery.country)?.code ?? "JP";
  const postalCodePatterns: Record<string, string> = {
    JP: "\\d{3}-?\\d{4}",
    KR: "\\d{5}",
    US: "\\d{5}(-\\d{4})?",
    GB: "(GIR 0AA|[A-Za-z]{1,2}\\d[A-Za-z\\d]?\\s?\\d[A-Za-z]{2})",
    AU: "\\d{4}",
    CA: "[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d",
  };
  const subtotal = items.reduce((sum, item) => sum + convertMajorAmount(item.price * item.qty, item.currency), 0);
  const deliveryPrice = convertMajorAmount(shippingOptions.find((option) => option.id === shipping)?.price ?? 0, "JPY");
  const total = subtotal + deliveryPrice;
  const checkoutDetails = {
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
      countryCode: deliveryCountryCode,
    },
    shippingMethod: shipping,
    paymentMethod,
    currency,
    items: items.map((item) => ({ variantId: item.variantId!, quantity: item.qty, expectedPriceAmount: item.price, expectedCurrency: item.currency })),
    couponCode: couponCode.trim() || undefined,
  };

  function checkoutFailureMessage(error: unknown, fallback: string) {
    if (error instanceof ApiNotConfiguredError) return t("checkout.error_not_configured", "Checkout is temporarily unavailable.");
    if (error instanceof ApiRequestError) {
      if (error.status === 401 || error.code === "email_verification_required") return t("checkout.error_verified_account", "Sign in with a verified Ponyo account before checkout.");
      if (error.status === 409) return t("checkout.error_details_changed", "Some order details changed. Please review them and try again.");
      if (error.status === 422) return t("checkout.error_address_invalid", "Please check your delivery details and try again.");
      return fallback;
    }
    if (error instanceof TypeError) return fallback;
    return error instanceof Error ? error.message : fallback;
  }
  const quoteInputKey = JSON.stringify(checkoutDetails);
  const currentQuoteInputKey = useRef(quoteInputKey);
  useEffect(() => { currentQuoteInputKey.current = quoteInputKey; }, [quoteInputKey]);
  const previousQuoteInputKey = useRef(quoteInputKey);
  useEffect(() => {
    if (previousQuoteInputKey.current !== quoteInputKey) {
      checkoutIdempotencyKey.current = null;
      window.sessionStorage.removeItem("ponyo:checkout-idempotency-key");
      previousQuoteInputKey.current = quoteInputKey;
    }
  }, [quoteInputKey]);
  const quote = quoteState?.inputKey === quoteInputKey ? quoteState.quote : null;

  function checkoutInput(): CheckoutQuoteInput {
    if (paymentMethod !== "card" && paymentMethod !== "apple_pay") {
      throw new Error(t("checkout.error_payment_unavailable", "This payment method is not available for secure checkout."));
    }
    return {
      ...checkoutDetails,
      paymentMethod,
      successUrl: `${window.location.origin}/orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}/checkout?checkout=cancelled`,
    };
  }

  async function requestQuote() {
    if (!PONYO_API_BASE_URL || quoting.current || submitting.current) return;
    quoting.current = true;
    setIsQuoting(true);
    setQuoteState(null);
    setApiError("");
    try {
      if (!customer) throw new Error(t("checkout.error_verified_account", "Sign in with a verified Ponyo account before checkout."));
      if (!items.length || items.some((item) => !item.variantId)) throw new Error(t("checkout.error_review_before_quote", "Review your cart before requesting a quote."));
      const storageSnapshot = () => buyNow ? window.sessionStorage.getItem("ponyo:buy-now-item") : JSON.stringify(readCart());
      const original = storageSnapshot();
      const expected = buyNow ? JSON.stringify(buyNowItem) : JSON.stringify(items);
      if (original !== expected) throw new Error(t("checkout.error_cart_changed", "Your cart changed. Review your cart before trying again."));
      const result = await ponyoApi.getCheckoutQuote(checkoutInput());
      if (storageSnapshot() !== original || currentQuoteInputKey.current !== quoteInputKey || currentCurrency.current !== currency) {
        throw new Error(t("checkout.error_details_changed", "Some order details changed. Please review them and try again."));
      }
      if (result.currency !== currency || ![result.subtotalAmount, result.discountAmount, result.shippingAmount, result.taxAmount, result.totalAmount, result.taxRateBps].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) {
        throw new Error(t("checkout.error_invalid_quote", "The checkout service returned an invalid quote. Please try again."));
      }
      setQuoteState({ inputKey: quoteInputKey, quote: result });
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 401 || error.code === "email_verification_required")) setCustomer(null);
      setApiError(checkoutFailureMessage(error, t("checkout.error_quote_failed", "We couldn’t prepare your order total. Please try again.")));
    } finally {
      quoting.current = false;
      setIsQuoting(false);
    }
  }

  const paymentOptions: Array<{ id: PaymentMethod; label: string; detail: string; brands?: string[]; enabled: boolean }> = [
    { id: "card", label: t("checkout.card", "Credit or debit card"), detail: PONYO_API_BASE_URL ? t("checkout.card_secure_detail", "Pay securely by card") : t("checkout.card_demo_detail", "Demo checkout · cards are not charged"), brands: ["visa", "mastercard", "jcb", "amex"], enabled: true },
    { id: "apple_pay", label: t("checkout.apple_pay", "Apple Pay"), detail: PONYO_API_BASE_URL ? t("checkout.apple_pay_detail", "Available on supported Apple devices") : t("checkout.demo_no_payment", "Demo checkout · no payment collected"), brands: ["apple_pay"], enabled: true },
    { id: "paypay", label: t("checkout.paypay", "PayPay"), detail: PONYO_API_BASE_URL ? t("checkout.japan_payment_detail", "Not available yet") : t("checkout.demo_no_payment", "Demo checkout · no payment collected"), brands: ["paypay"], enabled: !PONYO_API_BASE_URL },
    { id: "rakuten_pay", label: t("checkout.rakuten_pay", "Rakuten Pay"), detail: PONYO_API_BASE_URL ? t("checkout.japan_payment_detail", "Not available yet") : t("checkout.demo_no_payment", "Demo checkout · no payment collected"), brands: ["rakuten_pay"], enabled: !PONYO_API_BASE_URL },
    { id: "konbini", label: t("checkout.konbini_payment", "Konbini payment"), detail: PONYO_API_BASE_URL ? t("checkout.japan_payment_detail", "Not available yet") : t("checkout.demo_no_payment", "Demo checkout · no payment collected"), brands: ["konbini"], enabled: !PONYO_API_BASE_URL },
    { id: "amazon_pay", label: t("checkout.amazon_pay", "Amazon Pay"), detail: PONYO_API_BASE_URL ? t("checkout.payment_integration_detail", "Not available yet") : t("checkout.demo_no_payment", "Demo checkout · no payment collected"), brands: ["amazon_pay"], enabled: !PONYO_API_BASE_URL },
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
    void requestQuote();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const previewPayment = paymentOptions.find((option) => option.id === paymentMethod)?.label ?? t("checkout.card", "Credit or debit card");
  const previewPaymentDescription = t("checkout.preview_payment", "Preview · {{ payment }}", { payment: previewPayment });
  const previewTrackingCarrier = t("checkout.demo_tracking", "Japan Post · Demo tracking");

  function placePreviewOrder() {
    // eslint-disable-next-line react-hooks/purity -- Submit-event-only helper; never called during render.
    const id = `PNY-${Date.now().toString().slice(-8)}`;
    saveLocalOrder({
      id,
      createdAt: new Date().toISOString(),
      status: "Processing",
      payment: previewPaymentDescription,
      customerEmail: checkoutEmail,
      deliveryAddress: [checkoutDelivery.firstName + " " + checkoutDelivery.lastName, checkoutDelivery.address, checkoutDelivery.address2, checkoutDelivery.region, checkoutDelivery.city, checkoutDelivery.postal, checkoutDelivery.country].filter(Boolean).join(", "),
      total,
      currency,
      // eslint-disable-next-line react-hooks/purity -- Submit-event-only tracking ID, not render-time state.
      trackingNumber: `JP${Date.now().toString().slice(-10)}`,
      trackingCarrier: previewTrackingCarrier,
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
    if (submitting.current || quoting.current) return;
    setApiError("");
    if (PONYO_API_BASE_URL) {
      if (!customer) {
        setApiError(t("checkout.error_verified_account", "Sign in with a verified Ponyo account before checkout."));
        return;
      }
      if (paymentMethod !== "card" && paymentMethod !== "apple_pay") {
        setApiError(t("checkout.error_japan_payment", "This payment method will be available when Japan payment processing is connected."));
        return;
      }
      submitting.current = true;
      setIsSubmitting(true);
      try {
        // Compare the entire storage snapshot, not just quantities: never overwrite
        // a price refresh, cross-tab edit, or replacement buy-now selection.
        const storageSnapshot = () => buyNow ? window.sessionStorage.getItem("ponyo:buy-now-item") : JSON.stringify(readCart());
        const original = storageSnapshot();
        const expected = buyNow ? JSON.stringify(buyNowItem) : JSON.stringify(items);
        if (original !== expected) throw new Error(t("checkout.error_cart_changed", "Your cart changed. Review your cart before trying again."));
        let accepted: string | null = original;
        const assertUnchanged = () => {
          if (storageSnapshot() !== accepted || currentCurrency.current !== currency) {
            throw new Error(t("checkout.error_cart_currency_changed", "Your cart or currency changed during checkout. Review your cart and try again."));
          }
        };
        const refreshed = await refreshCartItems(items, currency);
        assertUnchanged();
        const priceChanged = refreshed.validation?.items.some((line) => line.priceChanged) || refreshed.items.some((item, index) => item.price !== items[index].price || item.currency !== items[index].currency);
        if (buyNow) {
          window.sessionStorage.setItem("ponyo:buy-now-item", JSON.stringify(refreshed.items[0]));
          setBuyNowItem(refreshed.items[0]);
        } else {
          saveCart(refreshed.items);
        }
        accepted = storageSnapshot();
        if (!refreshed.validation?.canCheckout) {
          setQuoteState(null);
          setApiError(priceChanged ? t("checkout.error_prices_stock", "Prices or currencies changed. Review the updated order and try again. Stock issues must be resolved in your cart.") : t("checkout.error_stock", "Some items are unavailable, have insufficient stock, or use different source currencies. Review your cart before checkout."));
          return;
        }
        if (priceChanged) {
          setQuoteState(null);
          setApiError(t("checkout.error_prices_changed", "Prices or currencies changed. Review the updated order, then continue to secure payment again to accept them."));
          return;
        }
        const checkoutItems = refreshed.items.map((item) => ({ variantId: item.variantId!, quantity: item.qty, expectedPriceAmount: item.price, expectedCurrency: item.currency }));
        assertUnchanged();
        if (!quote || currentQuoteInputKey.current !== quoteInputKey) {
          throw new Error(t("checkout.error_updated_quote", "Request and review an updated quote before continuing to payment."));
        }
        const requestKey = "ponyo:checkout-idempotency-key";
        const idempotencyKey = checkoutIdempotencyKey.current ?? window.sessionStorage.getItem(requestKey) ?? crypto.randomUUID();
        checkoutIdempotencyKey.current = idempotencyKey;
        window.sessionStorage.setItem(requestKey, idempotencyKey);
        const session = await ponyoApi.createCheckoutSession({
          ...checkoutInput(),
          idempotencyKey,
          items: checkoutItems,
          expectedTotalAmount: quote.totalAmount,
        });
        assertUnchanged();
        if (currentQuoteInputKey.current !== quoteInputKey) throw new Error(t("checkout.error_payment_details_changed", "Your checkout details changed during payment creation. Review your order again."));
        if (session.totalAmount !== quote.totalAmount || session.currency !== quote.currency) {
          throw new Error(t("checkout.error_total_changed", "The payment total changed. Request and review a new quote before payment."));
        }
        const checkoutUrl = new URL(session.checkoutUrl);
        if (checkoutUrl.protocol !== "https:") throw new Error(t("checkout.error_invalid_url", "The payment service returned an invalid checkout URL."));
        if (buyNow) window.sessionStorage.removeItem("ponyo:buy-now-item");
        window.location.assign(checkoutUrl.toString());
      } catch (error) {
        setQuoteState(null);
        if (error instanceof ApiRequestError && (error.code === "checkout_idempotency_conflict" || error.code === "checkout_session_closed")) {
          checkoutIdempotencyKey.current = null;
          window.sessionStorage.removeItem("ponyo:checkout-idempotency-key");
        }
        if (error instanceof ApiRequestError && (error.status === 401 || error.code === "email_verification_required")) {
          setCustomer(null);
        }
        setApiError(checkoutFailureMessage(error, t("checkout.error_start_failed", "We couldn’t start checkout. Please try again.")));
      } finally {
        submitting.current = false;
        setIsSubmitting(false);
      }
      return;
    }

    placePreviewOrder();
  }

  if (!buyNowReady) return <section className="checkout-empty" role="status"><p>{t("checkout.preparing", "Preparing your plush for checkout…")}</p></section>;

  if (PONYO_API_BASE_URL && sessionLoading) return <section className="checkout-empty" role="status"><p>{t("checkout.checking_account", "Checking your account…")}</p></section>;

  if (PONYO_API_BASE_URL && !customer) {
    return <section aria-label={t("checkout.sign_in_label", "Sign in for secure checkout")}>
      <div className="checkout-empty"><h1>{t("checkout.sign_in_heading", "Sign in before checkout")}</h1><p>{t("checkout.sign_in_body", "A verified Ponyo account is required to place an order. Your bag will stay here while you sign in or verify your email.")}</p></div>
      <AccountAuthForm mode="login" onAuthenticated={setCustomer} />
    </section>;
  }

  if (items.length === 0) {
    return (
      <section className="checkout-empty">
        <span aria-hidden="true">♡</span>
        <h1>{t("checkout.empty_heading", "Your bag is waiting for a plush friend.")}</h1>
        <p>{t("checkout.empty_body", "Add a plush to your bag, then come back to finish your order.")}</p>
        <Link className="shop-button shop-button-orange" href="/collections/all">{t("checkout.browse", "Browse all plush")} <b>→</b></Link>
      </section>
    );
  }

  return (
    <div className="checkout-flow">
      <div className="checkout-flow-heading">
        <div><p className="eyebrow">{t("checkout.eyebrow", "A LITTLE BUNDLE OF JOY")}</p><h1>{t("checkout.heading", "Checkout")}</h1></div>
        <span className="checkout-secure-note"><span aria-hidden="true">♧</span> {PONYO_API_BASE_URL ? t("checkout.secure_payment", "Secure payment checkout") : t("checkout.demo_no_payment", "Demo checkout · no payment collected")}</span>
        <span className="checkout-jellyfish" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z"/><circle cx="26" cy="23" r="2.6"/><circle cx="38" cy="23" r="2.6"/><path d="M22 29c1.4 1.6 3 1.6 4.4 0M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10"/></svg></span>
      </div>

      <ol className="checkout-steps" aria-label={t("checkout.steps", "Checkout steps")}>
        {[t("checkout.delivery", "Delivery"), t("checkout.payment", "Payment"), t("checkout.review", "Review")].map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><span>{index < step ? "✓" : index + 1}</span><b>{label}</b></li>)}
      </ol>

      <div className="checkout-columns">
        <div className="checkout-main-panel">
          {step === 0 && <form className="checkout-form" onSubmit={continueToPayment}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>01</span><div><h2>{t("checkout.contact", "Contact")}</h2><p>{customer ? t("checkout.contact_verified", "Order updates will be sent to your verified account email.") : t("checkout.contact_question", "Where should we send your order updates?")}</p></div></div>
              <label>{t("checkout.email", "Email address")}<input type="email" autoComplete="email" value={checkoutEmail} readOnly={Boolean(PONYO_API_BASE_URL)} onChange={(event) => setEmail(event.target.value)} placeholder={t("checkout.email_placeholder", "you@example.com")} required /></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>02</span><div><h2>{t("checkout.address_heading", "Delivery address")}</h2><p>{t("checkout.address_body", "Enter the address where your new friend will arrive.")}</p></div></div>
              <div className="checkout-field-grid">
                <label>{t("checkout.first_name_required", "First name *")}<input name="first-name" autoComplete="given-name" placeholder={t("checkout.first_name", "First name")} value={checkoutDelivery.firstName} onChange={(event) => setDelivery({ ...delivery, firstName: event.target.value })} required /></label>
                <label>{t("checkout.last_name_required", "Last name *")}<input name="last-name" autoComplete="family-name" placeholder={t("checkout.last_name", "Last name")} value={checkoutDelivery.lastName} onChange={(event) => setDelivery({ ...delivery, lastName: event.target.value })} required /></label>
              </div>
              <label>{t("checkout.address_required", "Address *")}<input name="address" autoComplete="address-line1" placeholder={t("checkout.street_placeholder", "Street address")} value={delivery.address} onChange={(event) => setDelivery({ ...delivery, address: event.target.value })} required /></label>
              <label>{t("checkout.address2", "Apartment, suite, etc. (if applicable)")}<input name="address2" autoComplete="address-line2" placeholder={t("checkout.address2_placeholder", "Building, apartment, room")} value={delivery.address2} onChange={(event) => setDelivery({ ...delivery, address2: event.target.value })} /></label>
              <div className="checkout-field-grid checkout-field-grid-city"><label>{t("checkout.city_required", "City *")}<input name="city" autoComplete="address-level2" placeholder={t("checkout.city", "City")} value={delivery.city} onChange={(event) => setDelivery({ ...delivery, city: event.target.value })} required /></label><label>{t("checkout.region_required", "Prefecture / region *")}<input name="region" autoComplete="address-level1" placeholder={t("checkout.region_placeholder", "Tokyo")} value={delivery.region} onChange={(event) => setDelivery({ ...delivery, region: event.target.value })} required /></label></div>
              <div className="checkout-field-grid checkout-field-grid-city"><label>{t("checkout.postal_required", "Postal code *")}<input name="postal" autoComplete="postal-code" placeholder={t("checkout.postal", "Postal code")} pattern={postalCodePatterns[deliveryCountryCode]} title={t("checkout.postal_validation", "Enter a valid postal code for the selected country.")} value={delivery.postal} onChange={(event) => setDelivery({ ...delivery, postal: event.target.value })} required /></label><label>{t("checkout.phone_required", "Phone *")}<input name="phone" type="tel" autoComplete="tel" pattern="\\+?[0-9\\s().-]{7,30}" title={t("checkout.phone_validation", "Enter a valid phone number, including its country code when possible.")} placeholder={t("checkout.phone_placeholder", "For delivery updates")} value={delivery.phone} onChange={(event) => setDelivery({ ...delivery, phone: event.target.value })} required /></label></div>
              <label>{t("checkout.country_required", "Country or region *")}<select name="country" value={delivery.country} onChange={(event) => setDelivery({ ...delivery, country: event.target.value })} required>{deliveryCountries.map((item) => <option key={item.code} value={item.label}>{regionName(item.code, language, item.label)}</option>)}</select></label>
            </section>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>03</span><div><h2>{t("checkout.shipping_heading", "Delivery method")}</h2><p>{t("checkout.shipping_body", "Choose how quickly your plush should travel.")}</p></div></div>
              <div className="checkout-choice-list">{shippingOptions.map((option) => <label className={`checkout-choice${shipping === option.id ? " is-selected" : ""}`} key={option.id}><input type="radio" name="shipping" value={option.id} checked={shipping === option.id} onChange={() => setShipping(option.id)} /><span><b>{option.name}</b><small>{option.detail}</small></span><strong>{option.price ? formatPrice(option.price, "JPY") : t("checkout.complimentary", "Complimentary")}</strong></label>)}</div>
            </section>
            <button type="submit" className="checkout-primary-button">{t("checkout.continue_payment", "Continue to payment")} <span aria-hidden="true">→</span></button>
          </form>}

          {step === 1 && <form className="checkout-form" onSubmit={continueToReview}>
            <section className="checkout-form-section">
              <div className="checkout-section-heading"><span>04</span><div><h2>{t("checkout.payment_heading", "Payment method")}</h2><p>{t("checkout.payment_body", "Choose a secure way to pay in Japan.")}</p></div></div>
              <div className="checkout-choice-list checkout-payment-list">
                {paymentOptions.map((option) => <label className={`checkout-choice checkout-payment-choice${paymentMethod === option.id ? " is-selected" : ""}${!option.enabled ? " is-coming-soon" : ""}`} key={option.id}>
                  <input type="radio" name="payment" value={option.id} checked={paymentMethod === option.id} disabled={!option.enabled} onChange={() => setPaymentMethod(option.id)} />
                  <span><b>{option.label}</b><small>{option.detail}</small>{option.brands && <span className="checkout-payment-icons">{option.brands.map((brand) => <PaymentBrandMark brand={brand} key={brand} />)}</span>}</span>
                  {!option.enabled && <strong className="checkout-coming-soon">{t("checkout.coming_soon", "Coming soon")}</strong>}
                </label>)}
              </div>
              <p className="checkout-preview-disclaimer">{t("checkout.card_privacy", "Card details are entered only on the secure payment page. Ponyo never stores your card number.")}</p>
            </section>
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(0)}>{t("checkout.back_delivery", "← Back to delivery")}</button><button type="submit" className="checkout-primary-button">{t("checkout.review_order", "Review order")} <span aria-hidden="true">→</span></button></div>
          </form>}

          {step === 2 && <section className="checkout-review-panel">
            <div className="checkout-section-heading"><span>05</span><div><h2>{t("checkout.review_heading", "Review your order")}</h2><p>{PONYO_API_BASE_URL ? t("checkout.review_secure_body", "Confirm your details, then continue to secure payment.") : t("checkout.review_demo_body", "Everything looks good? Place your local preview order.")}</p></div></div>
            <div className="checkout-review-block"><div><strong>{t("checkout.contact", "Contact")}</strong><button type="button" onClick={() => setStep(0)}>{t("checkout.edit", "Edit")}</button></div><p>{checkoutEmail}</p></div>
            <div className="checkout-review-block"><div><strong>{t("checkout.delivery", "Delivery")}</strong><button type="button" onClick={() => setStep(0)}>{t("checkout.edit", "Edit")}</button></div><p>{checkoutDelivery.firstName} {checkoutDelivery.lastName}<br />{checkoutDelivery.address}{checkoutDelivery.address2 && <><br />{checkoutDelivery.address2}</>}<br />{[checkoutDelivery.city, checkoutDelivery.region, checkoutDelivery.postal, regionName(deliveryCountries.find((item) => item.label === checkoutDelivery.country)?.code ?? "JP", language, checkoutDelivery.country)].filter(Boolean).join(", ")}<br />{shippingOptions.find((option) => option.id === shipping)?.name}</p></div>
            <div className="checkout-review-block"><div><strong>{t("checkout.payment", "Payment")}</strong><button type="button" onClick={() => setStep(1)}>{t("checkout.edit", "Edit")}</button></div><p>{paymentOptions.find((option) => option.id === paymentMethod)?.label ?? t("checkout.card", "Credit or debit card")}</p></div>
            {PONYO_API_BASE_URL && <form className="checkout-form checkout-form-section" onSubmit={(event) => { event.preventDefault(); void requestQuote(); }} aria-busy={isQuoting}>
              <label htmlFor="checkout-coupon">{t("checkout.coupon_label", "Coupon code (optional)")}<input id="checkout-coupon" name="coupon" autoComplete="off" value={couponCode} disabled={isQuoting || isSubmitting} onChange={(event) => { setCouponCode(event.target.value); setQuoteState(null); }} placeholder={t("checkout.coupon_placeholder", "Enter a coupon code")} /></label>
              {!isQuoting && (!quote || couponCode.trim()) && <button type="submit" className="checkout-secondary-button" disabled={isSubmitting}>{couponCode.trim() ? t("checkout.coupon_refresh", "Apply coupon") : t("checkout.quote_refresh", "Update total")}</button>}
                {isQuoting && <p role="status">{t("checkout.quote_checking", "Updating your order…")}</p>}
            </form>}
            {apiError && <p className="api-form-error" role="alert">{apiError}</p>}
            <div className="checkout-step-actions"><button type="button" className="checkout-secondary-button" onClick={() => setStep(1)} disabled={isSubmitting || isQuoting}>{t("checkout.back_payment", "← Back to payment")}</button><button type="button" className="checkout-primary-button" onClick={placeLocalOrder} disabled={isSubmitting || isQuoting || Boolean(PONYO_API_BASE_URL && !quote)}>{isSubmitting ? t("checkout.starting", "Starting checkout…") : PONYO_API_BASE_URL ? t("checkout.continue_secure", "Continue to secure payment") : t("checkout.place_demo", "Place demo order")}<span aria-hidden="true">→</span></button></div>
            {!PONYO_API_BASE_URL && <p className="checkout-preview-disclaimer">{t("checkout.demo_disclaimer", "Demo checkout only. No payment is collected.")}</p>}
          </section>}
        </div>

        <aside className="checkout-order-card" aria-label={t("checkout.summary", "Order summary")}>
          <div className="checkout-order-heading"><h2>{t("checkout.your_order", "Your order")}</h2><span>{t("checkout.item_count", "{{ count }} items", { count: items.reduce((sum, item) => sum + item.qty, 0) })}</span></div>
          <div className="checkout-order-items">{items.map((item) => <div className="checkout-order-item" key={item.id}><span className="checkout-order-image"><Image src={item.image} alt={item.imageAlt} fill sizes="72px"/><b>{item.qty}</b></span><span className="checkout-order-item-copy"><strong>{item.name}</strong><small>{item.maker}</small></span><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>
          {PONYO_API_BASE_URL ? <div className="checkout-totals" aria-live="polite" aria-busy={isQuoting}>
            <div><span>{quote ? t("checkout.subtotal", "Subtotal") : t("checkout.subtotal_estimate", "Subtotal (estimate)")}</span><strong>{quote ? formatQuotedAmount(quote.subtotalAmount, quote.currency) : formatPrice(subtotal, currency)}</strong></div>
            <div><span>{quote?.couponCode ? t("checkout.discount_coupon", "Discount ({{ code }})", { code: quote.couponCode }) : t("checkout.discount", "Discount")}</span><strong>{quote ? formatQuotedAmount(-quote.discountAmount, quote.currency) : t("checkout.awaiting_quote", "Awaiting quote")}</strong></div>
            <div><span>{t("checkout.delivery", "Delivery")}</span><strong>{quote ? formatQuotedAmount(quote.shippingAmount, quote.currency) : t("checkout.awaiting_quote", "Awaiting quote")}</strong></div>
            <div><span>{quote ? t("checkout.tax_rate", "Tax ({{ rate }}%)", { rate: quote.taxRateBps / 100 }) : t("checkout.tax", "Tax")}</span><strong>{quote ? formatQuotedAmount(quote.taxAmount, quote.currency) : t("checkout.awaiting_quote", "Awaiting quote")}</strong></div>
            <div className="checkout-grand-total"><span>{quote ? t("checkout.total_currency", "Total ({{ currency }})", { currency: quote.currency }) : t("checkout.total", "Total")}</span><strong>{quote ? formatQuotedAmount(quote.totalAmount, quote.currency) : t("checkout.awaiting_quote", "Awaiting quote")}</strong></div>
          </div> : <div className="checkout-totals"><div><span>{t("checkout.subtotal", "Subtotal")}</span><strong>{formatPrice(subtotal, currency)}</strong></div><div><span>{t("checkout.delivery", "Delivery")}</span><strong>{deliveryPrice ? formatPrice(deliveryPrice, currency) : t("checkout.complimentary", "Complimentary")}</strong></div><div className="checkout-grand-total"><span>{t("checkout.total", "Total")}</span><strong>{formatPrice(total, currency)}</strong></div></div>}
          <p className="checkout-order-note"><span aria-hidden="true">♡</span> {t("checkout.order_note", "A little bundle of joy, packed with care.")}</p>
        </aside>
      </div>
    </div>
  );
}