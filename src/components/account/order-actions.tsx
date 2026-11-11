"use client";

import { useRef, useState } from "react";
import { ponyoApi, type BackendOrder, type OrderStatusHistoryEntry, type PaymentStatus } from "@/services/ponyo-api.client";

function formatPaymentAmount(amount: number, currency: string) {
  // Match the API's zero-decimal JPY/IDR convention; never apply storefront FX.
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const digits = currency === "JPY" || currency === "IDR" ? 0 : formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount / 10 ** digits);
}

export function OrderActions({ order, onUpdated }: { order: BackendOrder; onUpdated: (order: BackendOrder) => void }) {
  const [history, setHistory] = useState<OrderStatusHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [syncingPayment, setSyncingPayment] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [confirmingShipmentId, setConfirmingShipmentId] = useState<string | null>(null);
  const historyRequest = useRef(false);
  const cancelRequest = useRef(false);
  const paymentRequest = useRef(false);
  const canCancel = order.status === "pending_payment" && order.paymentStatus === "unpaid";
  const capturedAmount = payment?.capturedAmount ?? order.capturedAmount;
  const refundedAmount = payment?.refundedAmount ?? order.refundedAmount;
  const paymentCurrency = payment?.currency ?? order.currency;

  async function refreshPaymentStatus() {
    if (paymentRequest.current || cancelRequest.current) return;
    paymentRequest.current = true;
    setSyncingPayment(true);
    setPaymentError("");
    setCancelError("");
    try {
      const updated = await ponyoApi.syncPaymentStatus(order.id);
      setPayment(updated);
      setConfirmCancel(false);
      setHistory(null);
      // The sync response is authoritative even if the full-order reload fails.
      onUpdated({ ...order, status: updated.orderStatus, paymentStatus: updated.paymentStatus, captureMethod: updated.captureMethod, capturedAmount: updated.capturedAmount, refundedAmount: updated.refundedAmount });
      try {
        onUpdated(await ponyoApi.getOrder(order.id));
      } catch (error) {
        setPaymentError(`Payment status refreshed, but order details could not be reloaded. ${error instanceof Error ? error.message : "Please refresh again."}`);
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to refresh payment status. Please try again.");
    } finally {
      paymentRequest.current = false;
      setSyncingPayment(false);
    }
  }

  async function loadHistory() {
    if (historyRequest.current) return;
    historyRequest.current = true;
    setLoadingHistory(true);
    setHistoryError("");
    try {
      setHistory(await ponyoApi.getOrderHistory(order.id));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load order activity.");
    } finally {
      historyRequest.current = false;
      setLoadingHistory(false);
    }
  }

  async function cancelOrder() {
    if (!canCancel || cancelRequest.current || paymentRequest.current) return;
    cancelRequest.current = true;
    setCancelling(true);
    setCancelError("");
    try {
      // Only the backend may confirm provider expiry and release reservations.
      const updated = await ponyoApi.cancelOrder(order.id, reason.trim() ? { reason: reason.trim() } : {});
      onUpdated(updated);
      setPayment(null);
      setConfirmCancel(false);
      setHistory(null);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Unable to cancel this order. Its payment may have changed; refresh your orders before trying again.");
    } finally {
      cancelRequest.current = false;
      setCancelling(false);
    }
  }

  async function confirmShipmentDelivery(shipmentId: string) {
    if (confirmingShipmentId) return;
    setConfirmingShipmentId(shipmentId);
    setDeliveryError("");
    try {
      await ponyoApi.confirmShipmentDelivery(order.id, shipmentId);
      onUpdated(await ponyoApi.getOrder(order.id));
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Unable to confirm delivery. Please refresh and try again.");
    } finally {
      setConfirmingShipmentId(null);
    }
  }

  return <section className="order-delivery-summary" aria-label={`Order ${order.orderNumber} actions`}>
    <div aria-live="polite" aria-busy={syncingPayment}>
      <p>{payment ? `${payment.provider} payment status` : "Payment status"}: {(payment?.paymentStatus ?? order.paymentStatus).replaceAll("_", " ")}</p>
      {capturedAmount !== undefined && <p>Captured: {formatPaymentAmount(capturedAmount, paymentCurrency)}</p>}
      {refundedAmount !== undefined && <p>Refunded: {formatPaymentAmount(refundedAmount, paymentCurrency)}</p>}
    </div>
    <button type="button" className="checkout-secondary-button" onClick={() => void refreshPaymentStatus()} disabled={syncingPayment || cancelling}>{syncingPayment ? "Refreshing payment status…" : "Refresh payment status"}</button>
    {paymentError && <p className="api-form-error" role="alert">{paymentError}</p>}
    <button type="button" className="checkout-secondary-button" onClick={() => void loadHistory()} disabled={loadingHistory || cancelling}>{loadingHistory ? "Loading activity…" : history ? "Refresh order activity" : "View order activity"}</button>
    {historyError && <p className="api-form-error" role="alert">{historyError}</p>}
    {history && (history.length ? <ol aria-label="Order activity">{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
      <time dateTime={entry.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time>
      <p>{entry.fromStatus ? `${entry.fromStatus.replaceAll("_", " ")} → ` : ""}{entry.toStatus.replaceAll("_", " ")} · Payment: {entry.paymentStatus.replaceAll("_", " ")} · Fulfillment: {entry.fulfillmentStatus.replaceAll("_", " ")}</p>
      <small>Source: {entry.source}</small>
    </li>)}</ol> : <p>No order activity yet.</p>)}
    {order.shipments?.map((shipment) => <section key={shipment.id} className="order-delivery-summary" aria-label={`Shipment ${shipment.shipmentNumber}`}>
      <h3>{shipment.carrier} · {shipment.status.replaceAll("_", " ")}</h3>
      <p>Tracking number: {shipment.trackingNumber}</p>
      {shipment.trackingUrl && <p><a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment ↗</a></p>}
      {shipment.estimatedDeliveryAt && <p>Estimated delivery: <time dateTime={shipment.estimatedDeliveryAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(shipment.estimatedDeliveryAt))}</time></p>}
      {!!shipment.items.length && <p>Items in this shipment: {shipment.items.map((line) => `${order.items.find((item) => item.id === line.orderItemId)?.name ?? "Item"} × ${line.quantity}`).join(", ")}</p>}
      {!!shipment.events.length && <ol aria-label="Shipment status updates">{shipment.events.map((event, index) => <li key={`${event.occurredAt}-${index}`}>
        <time dateTime={event.occurredAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time>
        <p>{event.status.replaceAll("_", " ")}{event.note ? ` · ${event.note}` : ""}</p>
      </li>)}</ol>}
      {shipment.status === "delivered" && !shipment.customerConfirmedAt && <button type="button" className="checkout-secondary-button" onClick={() => void confirmShipmentDelivery(shipment.id)} disabled={confirmingShipmentId !== null}>
        {confirmingShipmentId === shipment.id ? "Confirming delivery…" : "Confirm delivery"}
      </button>}
      {shipment.customerConfirmedAt && <p role="status">Delivery confirmed by you.</p>}
    </section>)}
    {deliveryError && <p className="api-form-error" role="alert">{deliveryError}</p>}
    {canCancel && <div className="checkout-form">
      <p>Only unpaid orders awaiting payment can be cancelled. Cancellation is confirmed only after the payment provider confirms checkout has expired.</p>
      {confirmCancel ? <form onSubmit={(event) => { event.preventDefault(); void cancelOrder(); }}>
        <label>Reason (optional)<input value={reason} maxLength={500} disabled={cancelling || syncingPayment} onChange={(event) => setReason(event.target.value)} /></label>
        <button type="submit" className="checkout-secondary-button" disabled={cancelling || syncingPayment}>{cancelling ? "Confirming cancellation…" : "Confirm cancellation"}</button>
        <button type="button" className="checkout-secondary-button" disabled={cancelling || syncingPayment} onClick={() => setConfirmCancel(false)}>Keep order</button>
      </form> : <button type="button" className="checkout-secondary-button" disabled={syncingPayment} onClick={() => setConfirmCancel(true)}>Cancel unpaid order</button>}
    </div>}
    {cancelError && <p className="api-form-error" role="alert">{cancelError}</p>}
  </section>;
}