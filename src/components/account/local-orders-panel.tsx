"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/utils/format-price";
import { getLocalOrdersSnapshot, subscribeToLocalOrders, type LocalOrder } from "@/lib/local-orders";
import { ApiNotConfiguredError, ponyoApi, PONYO_API_BASE_URL, type BackendOrder } from "@/services/ponyo-api.client";

function fromBackendOrder(order: BackendOrder): LocalOrder {
  const normalizedStatus = order.status.toLowerCase();
  const status = normalizedStatus.includes("deliver") ? "Delivered" : normalizedStatus.includes("process") ? "Processing" : "Confirmed";
  return {
    id: order.orderNumber || order.id,
    createdAt: order.createdAt,
    status,
    payment: order.paymentStatus,
    customerEmail: order.customerEmail,
    deliveryAddress: order.deliveryAddress,
    total: order.totalAmount,
    currency: order.currency,
    items: order.items.map((item) => ({
      id: item.id,
      slug: item.id,
      name: item.name,
      maker: item.maker ?? "Ponyo",
      price: item.unitPrice,
      currency: item.currency,
      image: item.image,
      imageAlt: item.imageAlt ?? item.name,
      qty: item.quantity,
    })),
  };
}

export function LocalOrdersPanel() {
  const serialized = useSyncExternalStore(subscribeToLocalOrders, getLocalOrdersSnapshot, () => "[]");
  const orders = useMemo(() => {
    try { return JSON.parse(serialized) as LocalOrder[]; }
    catch { return []; }
  }, [serialized]);
  const [backendOrders, setBackendOrders] = useState<LocalOrder[] | null>(null);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getOrders()
      .then((result) => { if (active) setBackendOrders(result.map(fromBackendOrder)); })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiNotConfiguredError)) setApiError(error instanceof Error ? error.message : "Unable to load order history.");
        setBackendOrders([]);
      });
    return () => { active = false; };
  }, []);
  const visibleOrders = backendOrders ?? orders;

  return (
    <section className="orders-panel" aria-labelledby="orders-heading">
      <div className="orders-panel-heading">
        <div><span className="account-auth-eyebrow">YOUR PONYO ACCOUNT</span><h1 id="orders-heading">Order history</h1><p>Keep track of your plush on its way home.</p></div>
        <Link className="orders-profile-link" href="/account">Account overview <span aria-hidden="true">→</span></Link>
      </div>
      {apiError && <p className="api-form-error" role="alert">{apiError}</p>}
      {visibleOrders.length ? (
        <div className="order-history-list">
          {visibleOrders.map((order) => (
            <article className="order-history-card" key={order.id}>
              <header><div><span>ORDER PLACED</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(order.createdAt))}</strong></div><div><span>ORDER NUMBER</span><strong>{order.id}</strong></div><div className="order-status"><span>STATUS</span><strong>{order.status}</strong></div><div className="order-total"><span>TOTAL</span><strong>{formatPrice(order.total, order.currency)}</strong></div></header>
              {(order.deliveryAddress || order.customerEmail) && <div className="order-delivery-summary"><span>DELIVERY DETAILS</span><p>{order.customerEmail}{order.customerEmail && order.deliveryAddress ? " · " : ""}{order.deliveryAddress}</p></div>}
              <div className="order-history-items">{order.items.map((item) => <div className="order-history-item" key={`${order.id}-${item.id}`}><Image src={item.image} alt={item.imageAlt} width={72} height={72} /><span><strong>{item.name}</strong><small>Qty {item.qty} · {item.maker}</small></span><b>{formatPrice(item.price * item.qty, item.currency)}</b></div>)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="orders-empty-state"><span aria-hidden="true">♡</span><h2>No orders just yet</h2><p>Your order history will appear here after you complete the local checkout preview.</p><Link className="shop-button shop-button-orange" href="/collections/all">Find your forever plush <b>→</b></Link></div>
      )}
      <p className="local-preview-note">Orders in this preview are saved only in this browser.</p>
      <span className="sr-only" aria-live="polite">{visibleOrders.length} orders</span>
    </section>
  );
}
