import { useSyncExternalStore } from "react";
import { cartStorageKey, type CartItem } from "@/lib/cart";
import type { ShopifyCart } from "@/services/shopify-cart.service";

const cartSyncEvent = "ponyo:shopify-cart";
const dataKey = "ponyo:shopify-cart-data";
const errorKey = "ponyo:shopify-cart-error";

function snapshot() {
	if (typeof window === "undefined") return "{}";
	try {
		return JSON.stringify({
			cart: JSON.parse(localStorage.getItem(dataKey) ?? "null"),
			error: localStorage.getItem(errorKey),
			local: JSON.parse(localStorage.getItem(cartStorageKey) ?? "[]"),
		});
	} catch {
		return "{}";
	}
}

export function publishShopifyCart(
	cart: ShopifyCart | null,
	items: CartItem[],
	error: string | null = null,
) {
	try {
		localStorage.setItem(dataKey, JSON.stringify(cart));
		localStorage.setItem(cartStorageKey, JSON.stringify(items));
		if (error) localStorage.setItem(errorKey, error);
		else localStorage.removeItem(errorKey);
	} catch {
		/* Continue without browser persistence. */
	}
	window.dispatchEvent(new CustomEvent(cartSyncEvent));
}

export function useShopifyCartState() {
	const serialized = useSyncExternalStore(
		(callback) => {
			window.addEventListener(cartSyncEvent, callback);
			window.addEventListener("storage", callback);
			return () => {
				window.removeEventListener(cartSyncEvent, callback);
				window.removeEventListener("storage", callback);
			};
		},
		snapshot,
		() => "{}",
	);
	try {
		const state = JSON.parse(serialized) as Partial<{
			cart: ShopifyCart | null;
			error: string | null;
			local: CartItem[];
		}>;
		return {
			cart: state.cart ?? null,
			error: state.error ?? null,
			local: Array.isArray(state.local) ? state.local : [],
		};
	} catch {
		return { cart: null, error: null, local: [] };
	}
}
