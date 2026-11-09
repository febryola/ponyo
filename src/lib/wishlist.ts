import { useSyncExternalStore } from "react";
import {
	ApiRequestError,
	ponyoApi,
	PONYO_API_BASE_URL,
} from "@/services/ponyo-api.client";

export const wishlistStorageKey = "ponyo:wishlist";
const legacyWishlistStorageKey = "ponyo-wishlist-v1";
let wishlistSyncQueue: Promise<void> = Promise.resolve();

export function readWishlist(): string[] {
	try {
		const stored =
			localStorage.getItem(wishlistStorageKey) ??
			localStorage.getItem(legacyWishlistStorageKey) ??
			"[]";
		const values = JSON.parse(stored) as unknown;
		return Array.isArray(values)
			? values.filter((handle): handle is string => typeof handle === "string")
			: [];
	} catch {
		return [];
	}
}

export function saveWishlist(handles: string[]) {
	try {
		localStorage.setItem(wishlistStorageKey, JSON.stringify(handles));
		localStorage.removeItem(legacyWishlistStorageKey);
	} catch {
		/* Wishlist remains available in the current page if storage is disabled. */
	}
	const detail = { list: handles };
	document.dispatchEvent(new CustomEvent("ponyo:wishlist-change", { detail }));
	window.dispatchEvent(
		new CustomEvent("ponyo:wishlist-updated", { detail: handles }),
	);
	if (PONYO_API_BASE_URL) {
		wishlistSyncQueue = wishlistSyncQueue
			.then(async () => {
				await ponyoApi.getMe();
				await ponyoApi.updateWishlist(handles);
			})
			.catch((error: unknown) => {
				if (!(error instanceof ApiRequestError && error.status === 401)) {
					console.error("Ponyo wishlist could not be synced.", error);
				}
			});
	}
}

export function useWishlistHandles() {
	const serialized = useSyncExternalStore(
		(callback) => {
			document.addEventListener("ponyo:wishlist-change", callback);
			window.addEventListener("ponyo:wishlist-updated", callback);
			window.addEventListener("storage", callback);
			return () => {
				document.removeEventListener("ponyo:wishlist-change", callback);
				window.removeEventListener("ponyo:wishlist-updated", callback);
				window.removeEventListener("storage", callback);
			};
		},
		() => {
			try {
				return (
					localStorage.getItem(wishlistStorageKey) ??
					localStorage.getItem(legacyWishlistStorageKey) ??
					"[]"
				);
			} catch {
				return "[]";
			}
		},
		() => "[]",
	);
	try {
		const handles = JSON.parse(serialized) as unknown;
		return Array.isArray(handles)
			? handles.filter((handle): handle is string => typeof handle === "string")
			: [];
	} catch {
		return [];
	}
}
