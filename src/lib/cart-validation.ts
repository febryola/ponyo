import type { CartItem } from "@/lib/cart";
import { ponyoApi, PONYO_API_BASE_URL, type CartValidation } from "@/services/ponyo-api.client";

// Additive fields shared with cart storage; never replace the local line identity.
export type ValidatedCartItem = CartItem & {
  validationIssue?: string;
  availability?: "available" | "unavailable";
  availableQuantity?: number;
};

/** Metadata refreshes do not change the request identity or trigger another effect. */
export function cartValidationKey(items: CartItem[], currency: string) {
  return JSON.stringify([currency, items.map(({ id, variantId, qty }) => [id, variantId, qty])]);
}

export async function refreshCartItems(items: CartItem[], currency: string): Promise<{ items: ValidatedCartItem[]; validation: CartValidation | null }> {
  if (!PONYO_API_BASE_URL) return { items, validation: null };
  if (items.length > 100 || items.some((item) => !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99)) {
    throw new Error("Cart supports up to 100 lines and quantities from 1 to 99. Please edit your cart.");
  }
  const live = items.filter((item) => item.variantId);
  if (new Set(live.map((item) => item.variantId)).size !== live.length || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Duplicate cart lines need review. Please remove duplicates before checkout.");
  }
  const validation = await ponyoApi.validateCart({
    currency,
    items: live.map((item) => ({ variantId: item.variantId!, quantity: item.qty, expectedPriceAmount: item.price, expectedCurrency: item.currency })),
  });
  const lines = new Map(validation.items.map((line) => [line.variantId, line]));
  if (lines.size !== live.length || validation.items.length !== live.length || live.some((item) => lines.get(item.variantId!)?.quantity !== item.qty)) {
    throw new Error("Cart validation returned an incomplete snapshot. Please retry.");
  }
  const updated = items.map((item): ValidatedCartItem => {
    const line = item.variantId ? lines.get(item.variantId) : undefined;
    if (!line) return { ...item, availability: "unavailable", availableQuantity: 0, validationIssue: "product_unavailable" };
    const visible = line.productId !== null && line.priceAmount !== null && line.currency !== null;
    return {
      ...item,
      ...(visible ? {
        catalogId: line.productId!, name: line.name, image: line.image ?? item.image,
        imageAlt: line.imageAlt ?? item.imageAlt, maker: line.maker ?? item.maker,
        slug: line.slug ?? item.slug, price: line.priceAmount!, currency: line.currency!,
      } : {}),
      availability: visible ? line.availability : "unavailable",
      availableQuantity: line.availableQuantity,
      validationIssue: line.issues.join(",") || undefined,
    };
  });
  return { items: updated, validation: { ...validation, canCheckout: validation.canCheckout && updated.length > 0 && updated.every((item) => item.availability === "available" && !item.validationIssue) } };
}