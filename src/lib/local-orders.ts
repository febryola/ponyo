import type { CartItem } from "@/lib/cart";

export type LocalOrder = {
	id: string;
	createdAt: string;
	status: "Confirmed" | "Processing" | "Delivered";
	payment: string;
	customerEmail?: string;
	deliveryAddress?: string;
	trackingNumber?: string;
	trackingCarrier?: string;
	total: number;
	currency: string;
	items: CartItem[];
};

const storageKey = "ponyo-preview-orders-v1";
const updatedEvent = "ponyo:orders-updated";

export function getLocalOrdersSnapshot() {
	if (typeof window === "undefined") return "[]";
	try {
		return localStorage.getItem(storageKey) ?? "[]";
	} catch {
		return "[]";
	}
}

export function readLocalOrders(): LocalOrder[] {
	try {
		const parsed = JSON.parse(getLocalOrdersSnapshot()) as LocalOrder[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function saveLocalOrder(order: LocalOrder) {
	const orders = [order, ...readLocalOrders()];
	try {
		localStorage.setItem(storageKey, JSON.stringify(orders));
		window.dispatchEvent(new Event(updatedEvent));
	} catch {
		// Keep the checkout preview usable if browser storage is disabled.
	}
}

export function subscribeToLocalOrders(callback: () => void) {
	window.addEventListener(updatedEvent, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(updatedEvent, callback);
		window.removeEventListener("storage", callback);
	};
}

export const localOrdersStorageKey = storageKey;
