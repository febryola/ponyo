import { useSyncExternalStore } from "react";

export type CartItem = {
	id: string;
	productId?: number;
	variantId?: string;
	slug: string;
	name: string;
	maker: string;
	price: number;
	currency: string;
	image: string;
	imageAlt: string;
	qty: number;
};

export const cartStorageKey = "ponyo-cart-v2";
export const cartUpdatedEvent = "ponyo:cart-updated";

function cartSnapshot() {
	if (typeof window === "undefined") return "[]";
	try {
		return localStorage.getItem(cartStorageKey) ?? "[]";
	} catch {
		return "[]";
	}
}

function subscribeToCart(callback: () => void) {
	window.addEventListener(cartUpdatedEvent, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(cartUpdatedEvent, callback);
		window.removeEventListener("storage", callback);
	};
}

export function useCartItems() {
	const serialized = useSyncExternalStore(
		subscribeToCart,
		cartSnapshot,
		() => "[]",
	);
	try {
		const items = JSON.parse(serialized) as CartItem[];
		return Array.isArray(items)
			? items.filter((item) => item && item.id && item.qty > 0)
			: [];
	} catch {
		return [];
	}
}

export function readCart(): CartItem[] {
	try {
		const stored = JSON.parse(
			localStorage.getItem(cartStorageKey) ?? "[]",
		) as CartItem[];
		return Array.isArray(stored)
			? stored.filter((item) => item && item.id && item.qty > 0)
			: [];
	} catch {
		return [];
	}
}

export function saveCart(items: CartItem[]) {
	try {
		localStorage.setItem(cartStorageKey, JSON.stringify(items));
		window.dispatchEvent(new CustomEvent(cartUpdatedEvent, { detail: items }));
	} catch {
		// The cart remains usable in memory if browser storage is unavailable.
	}
}

export function shopifyCartUrl(items: CartItem[]) {
	const lines = items
		.filter((item) => item.variantId && item.qty > 0)
		.map((item) => `${encodeURIComponent(item.variantId!)}:${item.qty}`)
		.join(",");
	const domain = (
		process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ??
		"ponyo-plushies.myshopify.com"
	)
		.replace(/^https?:\/\//, "")
		.replace(/\/$/, "");
	return lines
		? `https://${domain}/cart/${lines}`
		: `https://${domain}/collections/all`;
}
