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
  const { formatPrice } = useLocalization();
  const serialized = useSyncExternalStore(subscribeToLocalOrders, getLocalOrdersSnapshot, () => "[]");
  const orders = useMemo(() => {
    try { return JSON.parse(serialized) as LocalOrder[]; }
    catch { return []; }
  }, [serialized]);
  const [backendOrders, setBackendOrders] = useState<DisplayOrder[] | null>(null);
  const [apiError, setApiError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const checkoutSessionId = useSyncExternalStore(subscribeToLocation, getCheckoutSessionId, () => null);
  const previewOrderId = useSyncExternalStore(subscribeToLocation, getPreviewOrderId, () => null);
  const [checkoutReceipt, setCheckoutReceipt] = useState<CheckoutReceipt | null>(null);

  useEffect(() => {
    if (previewOrderId) return;
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    if (checkoutSessionId) {
      ponyoApi.getCheckoutReceipt(checkoutSessionId)
        .then((receipt) => {
          if (!active) return;
          setCheckoutReceipt(receipt);
          window.sessionStorage.removeItem("ponyo:checkout-idempotency-key");
          window.history.replaceState({}, "", "/orders?checkout=success");
        })
        .catch((error: unknown) => {
          if (active) setApiError(error instanceof Error ? error.message : "Unable to load your checkout receipt.");
        });
      return () => { active = false; };
    }
    ponyoApi.getOrders()
      .then((result) => { if (active) setBackendOrders(result.map(fromBackendOrder)); })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          setNeedsSignIn(true);
          setBackendOrders([]);
          return;
        }
        if (!(error instanceof ApiNotConfiguredError)) setApiError(error instanceof Error ? error.message : "Unable to load order history.");
        setBackendOrders([]);
      });
    return () => { active = false; };
  }, [checkoutSessionId, previewOrderId]);
  const visibleOrders: DisplayOrder[] = previewOrderId ? orders : backendOrders ?? (PONYO_API_BASE_URL ? [] : orders);
  const previewOrder = previewOrderId ? orders.find((order) => order.id === previewOrderId) : undefined;

  return (
    <section className="orders-panel" aria-labelledby="orders-heading">
      <div className="orders-panel-heading">
        <div><span className="account-auth-eyebrow">YOUR PONYO ACCOUNT</span><h1 id="orders-heading">Order history</h1><p>Keep track of your plush on its way home.</p></div>
        <Link className="orders-profile-link" href="/account">Account overview <span aria-hidden="true">→</span></Link>
      </div>
      {checkoutReceipt && <div className="order-history-card" role="status"><h2>Thanks for your order, {checkoutReceipt.orderNumber}!</h2><p>Payment: {checkoutReceipt.paymentStatus.replaceAll("_", " ")} · Status: {checkoutReceipt.status.replaceAll("_", " ")}</p><p>Total: {formatPrice(fromMinor(checkoutReceipt.totalAmount, checkoutReceipt.currency), checkoutReceipt.currency)}</p></div>}
      {previewOrder && <div className="order-history-card order-preview-confirmation" role="status"><h2>Sample order {previewOrder.id} is ready to track.</h2><p>This is demo order data. No payment was collected.</p>{previewOrder.trackingNumber && <p><strong>{previewOrder.trackingCarrier ?? "Demo carrier"} · Tracking number:</strong> {previewOrder.trackingNumber}</p>}</div>}
      {apiError && <p className="api-form-error" role="alert">{apiError}</p>}
      {needsSignIn ? <div className="orders-signin-card"><span aria-hidden="true">🪼</span><h2>Your orders are tucked away</h2><p>Sign in to the account connected to your Ponyo orders, or create one to get started.</p><AccountAuthForm mode="login" onAuthenticated={() => {
        setNeedsSignIn(false);
        setBackendOrders(null);
        ponyoApi.getOrders().then((result) => setBackendOrders(result.map(fromBackendOrder))).catch((error: unknown) => setApiError(error instanceof Error ? error.message : "Unable to load order history."));
      }} /></div> : visibleOrders.length ? (
        <div className="order-history-list">
          {visibleOrders.map((order) => (
            <article className="order-history-card" key={order.id}>
              <header><div><span>ORDER PLACED</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(order.createdAt))}</strong></div><div><span>ORDER NUMBER</span><strong>{order.id}</strong></div><div className="order-status"><span>STATUS</span><strong>{order.backend ? order.backend.status.replaceAll("_", " ") : order.status}</strong></div><div className="order-total"><span>TOTAL</span><strong>{formatPrice(order.total, order.currency)}</strong></div></header>
              {(order.deliveryAddress || order.customerEmail) && <div className="order-delivery-summary"><span>DELIVERY DETAILS</span><p>{order.customerEmail}{order.customerEmail && order.deliveryAddress ? " · " : ""}{order.deliveryAddress}</p></div>}
              {order.backend?.supplierFulfillmentStatus && <div className="order-delivery-summary"><span>SUPPLIER FULFILLMENT</span><p>{order.backend.supplierFulfillmentStatus.replaceAll("_", " ")}</p></div>}
              {order.backend?.subtotalAmount !== undefined && <div className="order-delivery-summary"><span>ORDER TOTALS</span><p>Subtotal: {formatPrice(fromMinor(order.backend.subtotalAmount, order.currency), order.currency)} · Discount{order.backend.couponCode ? ` (${order.backend.couponCode})` : ""}: {formatPrice(fromMinor(order.backend.discountAmount ?? 0, order.currency), order.currency)} · Shipping: {formatPrice(fromMinor(order.backend.shippingAmount ?? 0, order.currency), order.currency)} · Tax: {formatPrice(fromMinor(order.backend.taxAmount ?? 0, order.currency), order.currency)}</p></div>}
              {order.trackingNumber && <div className="order-delivery-summary order-tracking-summary"><span>TRACKING · {order.trackingCarrier ?? "CARRIER"}</span><p>{order.trackingNumber} {!order.backend && <small>Demo tracking reference</small>}</p></div>}
              <div className="order-history-items">{order.items.map((item) => <div className="order-history-item" key={`${order.id}-${item.id}`}><Image src={item.image} alt={item.imageAlt} width={72} height={72} /><span><strong>{item.name}</strong><small>Qty {item.qty} · {item.maker}</small></span><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>
              {order.backend && <OrderActions order={order.backend} onUpdated={(updated) => setBackendOrders((current) => current?.map((entry) => entry.backend?.id === updated.id ? fromBackendOrder(updated) : entry) ?? null)} />}
            </article>
          ))}
        </div>
      ) : checkoutSessionId ? null : (
        <div className="orders-empty-state"><span aria-hidden="true">♡</span><h2>No orders just yet</h2><p>Your order history will appear here after you complete the local checkout preview.</p><Link className="shop-button shop-button-orange" href="/collections/all">Find your forever plush <b>→</b></Link></div>
      )}
      {!PONYO_API_BASE_URL && <p className="local-preview-note">Orders in this preview are saved only in this browser.</p>}
      <span className="sr-only" aria-live="polite">{visibleOrders.length} orders</span>
    </section>
  );
}
