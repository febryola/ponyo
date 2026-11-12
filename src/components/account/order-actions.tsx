"use client";

import { useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { ponyoApi, type BackendOrder, type OrderStatusHistoryEntry, type PaymentStatus } from "@/services/ponyo-api.client";

function formatPaymentAmount(amount: number, currency: string, language: string) {
  // Match the API's zero-decimal JPY/IDR convention; never apply storefront FX.
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const digits = currency === "JPY" || currency === "IDR" ? 0 : formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(language === "en" ? "en-US" : language, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount / 10 ** digits);
}

export function OrderActions({ order, onUpdated }: { order: BackendOrder; onUpdated: (order: BackendOrder) => void }) {
  const { t, language } = useLocalization();
  const copy = (key: string, fallback: string, values?: Record<string, string | number>) => t(`orders.${key}`, fallback, values);
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
        setPaymentError(`${copy("reload_failed", "Payment status refreshed, but order details could not be reloaded.")} ${error instanceof Error ? error.message : copy("refresh_again", "Please refresh again.")}`);
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : copy("payment_failed", "Unable to refresh payment status. Please try again."));
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
      setHistoryError(error instanceof Error ? error.message : copy("activity_failed", "Unable to load order activity."));
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
      setCancelError(error instanceof Error ? error.message : copy("cancel_failed", "Unable to cancel this order. Its payment may have changed; refresh your orders before trying again."));
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
      setDeliveryError(error instanceof Error ? error.message : copy("delivery_failed", "Unable to confirm delivery. Please refresh and try again."));
    } finally {
      setConfirmingShipmentId(null);
    }
  }

  return <section className="orders-actions" aria-label={copy("actions_label", "Order {{ number }} actions", { number: order.orderNumber })}>
    <div className="orders-action-heading"><h3>{copy("manage", "Details & actions")}</h3><span className="orders-eyebrow">{copy("updates", "YOUR ORDER, AT A GLANCE")}</span></div>
    <div className="orders-payment" aria-live="polite" aria-busy={syncingPayment}>
      <p>{payment ? copy("provider_payment", "{{ provider }} payment status", { provider: payment.provider }) : copy("payment", "Payment status")}: <strong>{(payment?.paymentStatus ?? order.paymentStatus).replaceAll("_", " ")}</strong></p>
      {capturedAmount !== undefined && <p>{copy("captured", "Captured:")} {formatPaymentAmount(capturedAmount, paymentCurrency, language)}</p>}
      {refundedAmount !== undefined && <p>{copy("refunded", "Refunded:")} {formatPaymentAmount(refundedAmount, paymentCurrency, language)}</p>}
    </div>
    <div className="orders-action-buttons"><button type="button" className="orders-button" onClick={() => void refreshPaymentStatus()} disabled={syncingPayment || cancelling}>{syncingPayment ? copy("refreshing", "Refreshing payment status…") : copy("refresh_payment", "Refresh payment status")}</button>
    <button type="button" className="orders-button orders-button--quiet" onClick={() => void loadHistory()} disabled={loadingHistory || cancelling}>{loadingHistory ? copy("loading_activity", "Loading activity…") : history ? copy("refresh_activity", "Refresh order activity") : copy("view_activity", "View order activity")}</button></div>
    {paymentError && <p className="api-form-error" role="alert">{paymentError}</p>}
    {historyError && <p className="api-form-error" role="alert">{historyError}</p>}
    {history && (history.length ? <ol className="orders-timeline" aria-label={copy("activity", "Order activity")}>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
      <time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time>
      <p>{entry.fromStatus ? `${entry.fromStatus.replaceAll("_", " ")} → ` : ""}{entry.toStatus.replaceAll("_", " ")} · {copy("payment", "Payment status")}: {entry.paymentStatus.replaceAll("_", " ")} · {copy("fulfillment", "Fulfillment")}: {entry.fulfillmentStatus.replaceAll("_", " ")}</p>
      <small>{copy("source", "Source")}: {entry.source}</small>
    </li>)}</ol> : <p>{copy("no_activity", "No order activity yet.")}</p>)}
    {order.shipments?.map((shipment) => <section key={shipment.id} className="orders-shipment" aria-label={copy("shipment", "Shipment {{ number }}", { number: shipment.shipmentNumber })}>
      <h3>{shipment.carrier} · {shipment.status.replaceAll("_", " ")}</h3>
      <p>{copy("tracking", "Tracking number")}: {shipment.trackingNumber}</p>
      {shipment.trackingUrl && <p><a className="orders-text-link" href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">{copy("track", "Track shipment")} <span aria-hidden="true">↗</span></a></p>}
      {shipment.estimatedDeliveryAt && <p>{copy("estimated", "Estimated delivery")}: <time dateTime={shipment.estimatedDeliveryAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(shipment.estimatedDeliveryAt))}</time></p>}
      {!!shipment.items.length && <p>{copy("shipment_items", "Items in this shipment")}: {shipment.items.map((line) => `${order.items.find((item) => item.id === line.orderItemId)?.name ?? copy("item", "Item")} × ${line.quantity}`).join(", ")}</p>}
      {!!shipment.events.length && <ol className="orders-timeline" aria-label={copy("shipment_updates", "Shipment status updates")}>{shipment.events.map((event, index) => <li key={`${event.occurredAt}-${index}`}>
        <time dateTime={event.occurredAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time>
        <p>{event.status.replaceAll("_", " ")}{event.note ? ` · ${event.note}` : ""}</p>
      </li>)}</ol>}
      {shipment.status === "delivered" && !shipment.customerConfirmedAt && <button type="button" className="orders-button orders-button--quiet" onClick={() => void confirmShipmentDelivery(shipment.id)} disabled={confirmingShipmentId !== null}>
        {confirmingShipmentId === shipment.id ? copy("confirming_delivery", "Confirming delivery…") : copy("confirm_delivery", "Confirm delivery")}
      </button>}
      {shipment.customerConfirmedAt && <p role="status">{copy("delivery_confirmed", "Delivery confirmed by you.")}</p>}
    </section>)}
    {deliveryError && <p className="api-form-error" role="alert">{deliveryError}</p>}
    {canCancel && <div className="orders-cancel">
      <p>{copy("cancel_note", "Only unpaid orders awaiting payment can be cancelled. Cancellation is confirmed only after the payment provider confirms checkout has expired.")}</p>
      {confirmCancel ? <form onSubmit={(event) => { event.preventDefault(); void cancelOrder(); }}>
        <label>{copy("reason", "Reason (optional)")}<input value={reason} maxLength={500} disabled={cancelling || syncingPayment} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="orders-action-buttons"><button type="submit" className="orders-button" disabled={cancelling || syncingPayment}>{cancelling ? copy("cancelling", "Confirming cancellation…") : copy("confirm_cancel", "Confirm cancellation")}</button>
        <button type="button" className="orders-button orders-button--quiet" disabled={cancelling || syncingPayment} onClick={() => setConfirmCancel(false)}>{copy("keep", "Keep order")}</button></div>
      </form> : <button type="button" className="orders-button orders-button--quiet" disabled={syncingPayment} onClick={() => setConfirmCancel(true)}>{copy("cancel", "Cancel unpaid order")}</button>}
    </div>}
    {cancelError && <p className="api-form-error" role="alert">{cancelError}</p>}
  </section>;
}