"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { getLocalOrdersSnapshot, subscribeToLocalOrders, type LocalOrder } from "@/lib/local-orders";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, PONYO_API_BASE_URL, type BackendOrder, type CheckoutReceipt } from "@/services/ponyo-api.client";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { OrderActions } from "@/components/account/order-actions";

type DisplayOrder = LocalOrder & { backend?: BackendOrder };

const subscribeToHydration = () => () => {};
type OrderResult = { key: string; orders?: DisplayOrder[]; receipt?: CheckoutReceipt; error?: string; failed?: boolean; guest?: boolean };

function fromMinor(amount: number, currency: string) {
  return amount / (currency === "JPY" || currency === "IDR" ? 1 : 100);
}

function fromBackendOrder(order: BackendOrder): DisplayOrder {
  const normalizedStatus = order.status.toLowerCase();
  const status = normalizedStatus.includes("deliver") ? "Delivered" : normalizedStatus.includes("process") ? "Processing" : "Confirmed";
  return {
    backend: order,
    id: order.orderNumber || order.id,
    createdAt: order.createdAt,
    status,
    payment: order.paymentStatus,
    customerEmail: order.customerEmail,
    deliveryAddress: order.deliveryAddress,
    trackingNumber: order.trackingNumber ?? undefined,
    trackingCarrier: order.trackingCarrier ?? undefined,
    total: fromMinor(order.totalAmount, order.currency),
    currency: order.currency,
    items: order.items.map((item) => ({
      id: item.id,
      slug: item.id,
      name: item.name,
      maker: item.maker ?? "Ponyo",
      price: fromMinor(item.unitPrice, item.currency),
      currency: item.currency,
      image: item.image,
      imageAlt: item.imageAlt ?? item.name,
      qty: item.quantity,
    })),
  };
}

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getCheckoutSessionId() {
  return new URLSearchParams(window.location.search).get("session_id");
}

function getPreviewOrderId() {
  return new URLSearchParams(window.location.search).get("order_id");
}

export function LocalOrdersPanel() {
  const { formatPrice, language, t } = useLocalization();
  const copy = (key: string, fallback: string, values?: Record<string, string | number>) => t(`orders.${key}`, fallback, values);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const serialized = useSyncExternalStore(subscribeToLocalOrders, getLocalOrdersSnapshot, () => "[]");
  const orders = useMemo(() => {
    try { const parsed = JSON.parse(serialized); return Array.isArray(parsed) ? parsed as LocalOrder[] : []; }
    catch { return []; }
  }, [serialized]);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const checkoutSessionId = useSyncExternalStore(subscribeToLocation, getCheckoutSessionId, () => null);
  const previewOrderId = useSyncExternalStore(subscribeToLocation, getPreviewOrderId, () => null);
  const requestKey = JSON.stringify([checkoutSessionId, previewOrderId, attempt]);

  useEffect(() => {
    if (!hydrated || previewOrderId || !PONYO_API_BASE_URL || result?.key === requestKey) return;
    let active = true;
    if (checkoutSessionId) {
      ponyoApi.getCheckoutReceipt(checkoutSessionId)
        .then((receipt) => {
          if (!active) return;
          window.sessionStorage.removeItem("ponyo:checkout-idempotency-key");
          window.history.replaceState({}, "", "/orders?checkout=success");
          setResult({ key: JSON.stringify([null, previewOrderId, attempt]), receipt });
        })
        .catch((error: unknown) => {
          if (active) setResult({ key: requestKey, failed: true, error: error instanceof Error ? error.message : undefined });
        });
      return () => { active = false; };
    }
    ponyoApi.getOrders()
      .then((orders) => { if (active) setResult({ key: requestKey, orders: orders.map(fromBackendOrder) }); })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          setResult({ key: requestKey, guest: true });
          return;
        }
        setResult({ key: requestKey, failed: true, error: error instanceof Error && !(error instanceof ApiNotConfiguredError) ? error.message : undefined });
      });
    return () => { active = false; };
  }, [checkoutSessionId, previewOrderId, requestKey, hydrated, attempt, result?.key]);
  const current = result?.key === requestKey ? result : null;
  const loading = !hydrated || Boolean(PONYO_API_BASE_URL && !previewOrderId && !current);
  const visibleOrders: DisplayOrder[] = previewOrderId || !PONYO_API_BASE_URL ? orders : current?.orders ?? [];
  const checkoutReceipt = current?.receipt;
  const previewOrder = previewOrderId ? orders.find((order) => order.id === previewOrderId) : undefined;
  const retry = () => setAttempt((value) => value + 1);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value));

  return (
    <section className="orders-studio" aria-labelledby="orders-heading" aria-busy={loading}>
      <header className="orders-studio-heading">
        <div><span className="orders-eyebrow">{copy("eyebrow", "YOUR PONYO ACCOUNT")}</span><h1 id="orders-heading">{copy("title", "Your orders")}</h1><p>{copy("subtitle", "Little joys, thoughtfully kept track of.")}</p></div>
        <Link className="orders-button orders-button--quiet" href="/account">{copy("account", "Account overview")} <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="orders-section-label"><span>{copy("history", "Order history")}</span><span>{!loading && !current?.guest && !current?.failed && !checkoutReceipt ? copy("count", "{{ count }} orders", { count: visibleOrders.length }) : "PONYO"}</span></div>
      {loading ? <div className="orders-state orders-loading" role="status"><span className="orders-seal" aria-hidden="true">✦</span><h2>{copy("loading", "Gathering your orders…")}</h2><p>{copy("loading_body", "Just a moment while we check the details.")}</p><div className="orders-skeleton" aria-hidden="true"><i /><i /><i /></div></div>
      : current?.failed ? <div className="orders-state"><span className="orders-seal" aria-hidden="true">!</span><h2>{copy("error_title", "Your orders couldn’t be loaded")}</h2><p role="alert">{current.error || copy("error_body", "We couldn’t retrieve your order details. Please try again.")}</p><button className="orders-button" type="button" onClick={retry}>{copy("retry", "Try again")}</button><Link className="orders-text-link" href="/pages/contact">{copy("support", "Contact Ponyo support")}</Link></div>
      : current?.guest ? <div className="orders-guest"><div className="orders-guest-note"><Image src="/ponyo-jellyfish.svg" alt="" width={64} height={64} /><span className="orders-eyebrow">{copy("guest_eyebrow", "A LITTLE SPACE, JUST FOR YOU")}</span><h2>{copy("guest_title", "Your orders are tucked away")}</h2><p>{copy("guest_body", "Sign in to the account connected to your Ponyo orders to see their latest details.")}</p><Link className="orders-text-link" href="/pages/contact">{copy("support", "Contact Ponyo support")} <span aria-hidden="true">↗</span></Link></div><div className="orders-auth-embed"><AccountAuthForm mode="login" presentation="drawer" onAuthenticated={retry} /></div></div>
      : checkoutReceipt ? <div className="orders-state orders-receipt" role="status"><span className="orders-seal" aria-hidden="true">✓</span><span className="orders-eyebrow">{copy("receipt", "CHECKOUT RECEIPT")}</span><h2>{copy("thanks", "Thank you for your order")}</h2><p className="orders-reference">{checkoutReceipt.orderNumber}</p><dl className="orders-totals"><div><dt>{copy("payment", "Payment status")}</dt><dd>{checkoutReceipt.paymentStatus.replaceAll("_", " ")}</dd></div><div><dt>{copy("status", "Order status")}</dt><dd>{checkoutReceipt.status.replaceAll("_", " ")}</dd></div><div className="orders-grand-total"><dt>{copy("total", "Total")}</dt><dd>{formatPrice(fromMinor(checkoutReceipt.totalAmount, checkoutReceipt.currency), checkoutReceipt.currency)}</dd></div></dl><Link className="orders-button" href="/account">{copy("account", "Account overview")}</Link></div>
      : visibleOrders.length ? (
        <div className="orders-list">
          {previewOrder && <div className="orders-preview-note" role="status"><strong>{copy("sample", "Sample order {{ id }}", { id: previewOrder.id })}</strong><p>{copy("demo", "This is demo order data. No payment was collected.")}</p></div>}
          {visibleOrders.map((order) => (
            <article className="orders-card" key={order.id}>
              <header className="orders-card-heading"><div><span className="orders-eyebrow">{copy("number", "Order number")}</span><h2>{order.id}</h2></div><span className="orders-status">{(order.backend?.status ?? order.status).replaceAll("_", " ")}</span></header>
              <div className="orders-metadata"><div><span>{copy("placed", "Order placed")}</span><time dateTime={order.createdAt}>{date(order.createdAt)}</time></div><div><span>{copy("payment", "Payment status")}</span><strong>{order.payment.replaceAll("_", " ")}</strong></div><div><span>{copy("total", "Total")}</span><strong>{formatPrice(order.total, order.currency)}</strong></div></div>
              <div className="orders-card-body"><div className="orders-items"><h3>{copy("items", "Your plush, picked with love")}</h3>{order.items.map((item) => <div className="orders-item" key={`${order.id}-${item.id}`}><Image src={item.image} alt={item.imageAlt} width={192} height={192} sizes="(max-width: 600px) 72px, 96px" /><div><strong>{item.name}</strong><small>{item.maker}</small><span>{copy("qty", "Qty {{ count }}", { count: item.qty })}</span></div><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>
              <aside className="orders-summary"><h3>{copy("summary", "Order summary")}</h3><dl className="orders-totals">{order.backend?.subtotalAmount !== undefined && <><div><dt>{copy("subtotal", "Subtotal")}</dt><dd>{formatPrice(fromMinor(order.backend.subtotalAmount, order.currency), order.currency)}</dd></div><div><dt>{copy("discount", "Discount")}{order.backend.couponCode && <small>{order.backend.couponCode}</small>}</dt><dd>{formatPrice(fromMinor(order.backend.discountAmount ?? 0, order.currency), order.currency)}</dd></div><div><dt>{copy("shipping", "Shipping")}</dt><dd>{formatPrice(fromMinor(order.backend.shippingAmount ?? 0, order.currency), order.currency)}</dd></div><div><dt>{copy("tax", "Tax")}</dt><dd>{formatPrice(fromMinor(order.backend.taxAmount ?? 0, order.currency), order.currency)}</dd></div></>}<div className="orders-grand-total"><dt>{copy("total", "Total")}</dt><dd>{formatPrice(order.total, order.currency)}</dd></div></dl>
              {(order.deliveryAddress || order.customerEmail) && <div className="orders-detail"><h3>{copy("delivery", "Delivery details")}</h3>{order.customerEmail && <p>{order.customerEmail}</p>}{order.deliveryAddress && <p>{order.deliveryAddress}</p>}</div>}
              {order.backend?.supplierFulfillmentStatus && <div className="orders-detail"><h3>{copy("supplier", "Supplier fulfillment")}</h3><p>{order.backend.supplierFulfillmentStatus.replaceAll("_", " ")}</p></div>}
              {order.trackingNumber && <div className="orders-detail"><h3>{copy("tracking", "Tracking number")}</h3>{order.trackingCarrier && <p>{order.trackingCarrier}</p>}<p className="orders-reference">{order.trackingNumber}</p>{!order.backend && <small>{copy("demo_tracking", "Demo tracking reference")}</small>}</div>}</aside></div>
              {order.backend && <OrderActions order={order.backend} onUpdated={(updated) => setResult((current) => current ? { ...current, orders: current.orders?.map((entry) => entry.backend?.id === updated.id ? fromBackendOrder(updated) : entry) } : null)} />}
            </article>
          ))}
        </div>
      ) : (
        <div className="orders-state orders-empty"><Image src="/ponyo-jellyfish.svg" alt="" width={72} height={72} /><span className="orders-eyebrow">{copy("empty_eyebrow", "THE START OF SOMETHING SOFT")}</span><h2>{copy("empty_title", "A little joy is waiting for you.")}</h2><p>{copy("empty_body", "No orders yet. Once you place an order, its details will be here, ready whenever you need them.")}</p><Link className="orders-button" href="/collections/all">{copy("browse", "Find your forever plush")} <span aria-hidden="true">→</span></Link><span className="orders-empty-footnote">{copy("empty_note", "Hand-picked companions. A place in your heart.")}</span></div>
      )}
      {(!PONYO_API_BASE_URL || previewOrderId) && !loading && <p className="orders-preview-note">{copy("local_note", "Preview orders are saved only in this browser.")}</p>}
    </section>
  );
}
