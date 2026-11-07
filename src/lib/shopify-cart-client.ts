import type { ShopifyCart } from "@/services/shopify-cart.service";
import type { CartItem } from "@/lib/cart";

export class ShopifyCartClient {
	static async get(): Promise<ShopifyCart | null> {
		const response = await fetch("/api/cart", {
			headers: { Accept: "application/json" },
			cache: "no-store",
		});
		const result = (await response.json()) as {
			cart?: ShopifyCart | null;
			error?: string;
		};
		if (!response.ok) throw new Error(result.error ?? "Unable to read cart.");
		return result.cart ?? null;
	}

	static async checkoutUrl(): Promise<string> {
		const cart = await this.get();
		if (!cart) throw new Error("Your Shopify cart is empty.");
		return cart.checkoutUrl;
	}

	static async sync(items: CartItem[]): Promise<ShopifyCart> {
		const lines = items
			.filter((item) => item.variantId)
			.map((item) => ({ variantId: item.variantId!, quantity: item.qty }));
		const response = await fetch("/api/cart", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ lines }),
		});
		const result = (await response.json()) as {
			cart?: ShopifyCart;
			error?: string;
		};
		if (!response.ok || !result.cart)
			throw new Error(result.error ?? "Unable to update cart.");
		return result.cart;
	}

	static async applyDiscount(discountCode: string): Promise<ShopifyCart> {
		const response = await fetch("/api/cart", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ discountCode }),
		});
		const result = (await response.json()) as {
			cart?: ShopifyCart;
			error?: string;
		};
		if (!response.ok || !result.cart)
			throw new Error(result.error ?? "Unable to apply discount code.");
		return result.cart;
	}

	static toCartItems(cart: ShopifyCart): CartItem[] {
		return cart.lines.nodes.map((line) => ({
			id: line.merchandise.id.split("/").at(-1) ?? line.merchandise.id,
			productId: Number(line.merchandise.product.id.split("/").at(-1)),
			variantId: line.merchandise.id.split("/").at(-1) ?? line.merchandise.id,
			slug: line.merchandise.product.handle,
			name: line.merchandise.product.title,
			maker: line.merchandise.product.vendor,
			price: Number(line.merchandise.price.amount),
			currency: line.merchandise.price.currencyCode,
			image: line.merchandise.product.featuredImage?.url ?? "",
			imageAlt:
				line.merchandise.product.featuredImage?.altText ??
				line.merchandise.product.title,
			qty: line.quantity,
		}));
	}
}
