# Shipment and delivery management

Ponyo stores fulfillment at two independent levels:

- `supplierFulfillmentStatus` records supplier routing/confirmation (`pending`, `queued`, `on_hold`, or `supplier_confirmed`). A supplier accepting a purchase order does not mean a parcel has shipped.
- `fulfillmentStatus` and each shipment's `status` record parcel progress. A customer order can have multiple shipments, with each shipment carrying partial quantities from its order lines.

## Trusted operator API

All mutation requests require an authenticated admin, a valid CSRF token, and the normal API rate limits. Shipment creation is available at `POST /v1/orders/{orderId}/shipments` with carrier, tracking number, optional HTTPS tracking URL, optional ISO-8601 ETA, and one or more `{orderItemId, quantity}` lines. The API rejects unpaid/non-fulfillable orders, foreign order-line IDs, duplicate lines, and quantities that would exceed an order line across all shipments.

Update a shipment through `POST /v1/orders/{orderId}/shipments/{shipmentId}/status`. Supported progression is `label_created` → `in_transit` → `out_for_delivery` → `delivered`, with supported exception/return paths. Each update requires a unique `eventId`; replays with the same event ID and status are idempotent. Statuses are operator-entered; no carrier webhook or live carrier API is configured. Tracking links are restricted to HTTPS.

## Customer order tracking

Authenticated order list/detail responses include the shipment list, item quantities, tracking link/number, carrier, ETA, timestamps and status events. The account order history renders this information. A customer can call `POST /v1/orders/{orderId}/shipments/{shipmentId}/confirm-delivery` only for an owned shipment already marked delivered. Repeating confirmation is safe.

The order's aggregate parcel status becomes `partially_shipped`, `shipped`, or `delivered` as shipment quantities and statuses progress. Supplier status remains stored separately, including during partial shipment and delivery updates.

## Deployment

Apply Alembic revision `20261111_0022` after `20261111_0021`. Do not stamp or apply migrations to an existing populated database without backup and schema/revision verification. Migration generation/offline SQL checks do not substitute for staging execution. No external supplier or carrier is contacted by these tracking endpoints.
