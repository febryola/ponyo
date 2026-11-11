import { useSyncExternalStore } from "react";

export type CartItem = {
	id: string;
	catalogId?: string;
	variantId?: string;
	slug: string;
	name: string;
	maker: string;
	price: number;
	currency: string;
	image: string;
	imageAlt: string;
	qty: number;
	validationIssue?: string;
	availability?: "available" | "unavailable";
	availableQuantity?: number;
};

/** Live variants are distinct lines even when they share one product. */
export function addCartItem(items: CartItem[], incoming: CartItem): CartItem[] {
	if (!incoming?.id || !Number.isInteger(incoming.qty) || incoming.qty < 1 ||
		!Number.isFinite(incoming.price) || incoming.price < 0 || !incoming.currency) return items;
	const same = (item: CartItem) => incoming.variantId
		? item.variantId === incoming.variantId
		: !item.variantId && item.id === incoming.id;
	const existing = items.find(same);
	if (!existing && items.length >= 100) return items;
	const line = { ...incoming, id: incoming.variantId ?? incoming.id, qty: Math.min(99, incoming.qty) };
	return existing
		? items.map((item) => same(item) ? { ...line, id: item.id, qty: Math.min(99, item.qty + incoming.qty) } : item)
		: [...items, line];
}

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
// Browser storage serves guests/offline use; CartSync mirrors verified customer carts to the API.
