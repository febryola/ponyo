"use client";

import { useEffect } from "react";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { cartStorageKey, cartUpdatedEvent, readCart, saveCart, type CartItem } from "@/lib/cart";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerCartInput } from "@/services/ponyo-api.client";

const ownerKey = "ponyo-cart-owner";
const quantity = (value: number) => Math.min(99, Math.max(1, Math.floor(value)));

function payloadFor(items: ReadonlyArray<Pick<CartItem, "variantId" | "qty">>, currency: string): CustomerCartInput {
  const variants = new Map<string, number>();
  for (const item of items) {
    if (typeof item.variantId !== "string" || !item.variantId.trim() || !Number.isFinite(item.qty) || item.qty <= 0) continue;
    variants.set(item.variantId, Math.max(variants.get(item.variantId) ?? 0, quantity(item.qty)));
  }
  // Never silently truncate a replacement request: that would delete server items.
  if (variants.size > 100) throw new Error("Cart limit exceeded.");
  return {
    currency,
    items: [...variants].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, count]) => ({ variantId, quantity: count })),
  };
}

function warn() {
  console.warn("Cart sync unavailable; your browser cart is still available.");
}

/** Session profiles are issued only after backend email verification. */
export function CartSync() {
  const { customer, isLoading } = useCustomerSession();
  const customerId = customer?.id;

  useEffect(() => {
    if (isLoading || !PONYO_API_BASE_URL) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    let inFlight = false;
    let queued = false;
    let currency = "JPY";
    let accepted = "";
    let attempted = "";

    // Ownership is persisted so a reload or direct A -> B switch cannot merge A's
    // cart into B's account. Cleanup alone must not clear it (React StrictMode).
    try {
      const owner = localStorage.getItem(ownerKey);
      if (!customerId) {
        if (owner) {
          saveCart([]);
          if (readCart().length) throw new Error("Unable to detach owned cart.");
          localStorage.removeItem(ownerKey);
        }
        return;
      }
      if (owner && owner !== customerId) {
        saveCart([]);
        if (readCart().length) throw new Error("Unable to detach owned cart.");
      }
      localStorage.setItem(ownerKey, customerId);
    } catch {
      warn();
      return;
    }

    function ownsCart() {
      if (!active) return false;
      try {
        return localStorage.getItem(ownerKey) === customerId;
      } catch {
        return false;
      }
    }

    async function flush() {
      if (!ready || !ownsCart()) return;
      if (inFlight) {
        queued = true;
        return;
      }
      let payload: CustomerCartInput;
      try {
        payload = payloadFor(readCart(), currency);
      } catch {
        warn();
        return;
      }
      const serialized = JSON.stringify(payload);
      if (serialized === accepted || serialized === attempted) return;
      attempted = serialized;
      inFlight = true;
      try {
        await ponyoApi.updateCart(payload);
        if (ownsCart()) accepted = serialized;
      } catch {
        if (ownsCart()) warn();
      } finally {
        inFlight = false;
        // Only edits made during this request can queue another write. A failed
        // mutation never schedules its own retry or claims to have been saved.
        if (queued && ownsCart()) {
          queued = false;
          schedule();
        }
      }
    }

    function schedule() {
      if (!ready || !ownsCart()) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, 300);
    }

    function onStorage(event: StorageEvent) {
      if (event.key === cartStorageKey || event.key === null) schedule();
    }

    window.addEventListener(cartUpdatedEvent, schedule);
    window.addEventListener("storage", onStorage);

    const initial = readCart();
    void (async () => {
      try {
        const remote = await ponyoApi.getCart();
        if (!ownsCart()) return;
        if (remote.items.length > 100 || remote.items.some((item) =>
          !item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99,
        )) throw new Error("Invalid remote cart.");

        currency = remote.items.length ? remote.currency :
          (initial.find((item) => item.variantId)?.currency ?? remote.currency);
        const products = new Map<string, ReturnType<typeof ponyoApi.getProduct>>();
        const hydrated = await Promise.all(remote.items.map(async (item): Promise<CartItem | null> => {
          // Existing browser lines already contain product display data.
          if (initial.some((local) => local.variantId === item.variantId)) return null;
          if (!item.productId) throw new Error("Missing cart product.");
          const unavailable = {
            id: item.variantId,
            catalogId: item.productId,
            variantId: item.variantId,
            slug: item.productId,
            name: "Unavailable product",
            maker: "Ponyo",
            price: 0,
            currency: remote.currency,
            image: "/images/catalog/ponyo-2.png",
            imageAlt: "Unavailable product",
            qty: item.quantity,
            availability: "unavailable" as const,
            availableQuantity: 0,
            validationIssue: "product_unavailable",
          };
          let productRequest = products.get(item.productId);
          if (!productRequest) {
            productRequest = ponyoApi.getProduct(item.productId);
            products.set(item.productId, productRequest);
          }
          let product: Awaited<typeof productRequest>;
          try {
            product = await productRequest;
          } catch (error) {
            // Only a confirmed missing/hidden product is safe to retain as an
            // unavailable line. Unknown/network failures still block all PUTs.
            if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
              return unavailable;
            }
            throw error;
          }
          const variant = product.variants?.find((candidate) => candidate.id === item.variantId);
          // Inactive variants are omitted from the public product response.
          if (!variant) return unavailable;
          return {
            id: item.variantId,
            catalogId: product.id,
            variantId: item.variantId,
            slug: product.slug,
            name: product.name,
            maker: product.supplierName,
            // Product/cart display prices already share the same units.
            price: variant.priceAmount,
            currency: variant.currency,
            image: typeof product.image === "string" ? product.image : product.image.src,
            imageAlt: product.imageAlt,
            qty: item.quantity,
          };
        }));
        if (!ownsCart()) return;

        // Read after ALL async work: do not resurrect lines removed or override
        // quantities edited while login hydration was in progress.
        const merged = readCart().map((item) => ({ ...item }));
        remote.items.forEach((item, index) => {
          const local = merged.find((line) => line.variantId === item.variantId);
          const before = initial.find((line) => line.variantId === item.variantId);
          if (local) {
            if (!before || before.qty === local.qty) local.qty = Math.max(quantity(local.qty), item.quantity);
          } else if (!before && hydrated[index]) {
            merged.push(hydrated[index]);
          }
        });
        // Validate before applying; oversized carts remain locally usable.
        payloadFor(merged, currency);
        accepted = JSON.stringify(payloadFor(remote.items.map((item) => ({
          variantId: item.variantId, qty: item.quantity,
        })), currency));
        saveCart(merged);
        // saveCart deliberately swallows storage failures. Do not send a stale
        // browser snapshot if quota/privacy settings prevented remote hydration.
        if (JSON.stringify(readCart()) !== JSON.stringify(merged)) throw new Error("Unable to store cart.");
        ready = true;
        schedule();
      } catch {
        // No successful GET/hydration means no PUT: never replace an unknown
        // server cart with a partial browser snapshot, even after later edits.
        if (ownsCart()) warn();
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener(cartUpdatedEvent, schedule);
      window.removeEventListener("storage", onStorage);
    };
  }, [customerId, isLoading]);

  return null;
}