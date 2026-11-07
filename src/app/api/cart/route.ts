import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
	getShopifyCart,
	syncShopifyCart,
	updateShopifyCartDiscount,
	type DesiredCartLine,
} from "@/services/shopify-cart.service";

export const runtime = "nodejs";
const cookieName = "ponyo_shopify_cart";
const cookieOptions = {
	httpOnly: true,
	sameSite: "lax" as const,
	secure: process.env.NODE_ENV === "production",
	path: "/",
	maxAge: 60 * 60 * 24 * 30,
};

export async function GET() {
	const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
	if (!token)
		return NextResponse.json(
			{ error: "Shopify cart integration is not configured." },
			{ status: 503 },
		);
	const cookieStore = await cookies();
	const cartId = cookieStore.get(cookieName)?.value;
	if (!cartId) return NextResponse.json({ cart: null });
	try {
		const cart = await getShopifyCart(cartId);
		if (!cart) {
			const response = NextResponse.json({ cart: null });
			response.cookies.delete(cookieName);
			return response;
		}
		return NextResponse.json({ cart });
	} catch (error) {
		console.error("Unable to load Shopify cart.", error);
		return NextResponse.json(
			{ error: "Unable to load cart." },
			{ status: 502 },
		);
	}
}

export async function PUT(request: Request) {
	if (!process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN)
		return NextResponse.json(
			{ error: "Shopify cart integration is not configured." },
			{ status: 503 },
		);
	let body: { lines?: DesiredCartLine[] };
	try {
		body = (await request.json()) as { lines?: DesiredCartLine[] };
	} catch {
		return NextResponse.json({ error: "Invalid request." }, { status: 400 });
	}
	if (!Array.isArray(body.lines) || body.lines.length > 100)
		return NextResponse.json({ error: "Invalid cart lines." }, { status: 400 });
	if (
		body.lines.some(
			(line) =>
				!line ||
				typeof line.variantId !== "string" ||
				!/^\d+$/.test(line.variantId) ||
				!Number.isInteger(line.quantity) ||
				line.quantity < 1 ||
				line.quantity > 99,
		)
	) {
		return NextResponse.json(
			{
				error:
					"Cart lines must include Shopify variant IDs and quantities from 1 to 99.",
			},
			{ status: 400 },
		);
	}

	const cookieStore = await cookies();
	const cartId = cookieStore.get(cookieName)?.value;
	try {
		const cart = await syncShopifyCart(cartId, body.lines);
		const response = NextResponse.json({ cart });
		response.cookies.set(cookieName, cart.id, cookieOptions);
		return response;
	} catch (error) {
		console.error("Unable to synchronize Shopify cart.", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Unable to update cart.",
			},
			{ status: 502 },
		);
	}
}

export async function PATCH(request: Request) {
	if (!process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN)
		return NextResponse.json(
			{ error: "Shopify cart integration is not configured." },
			{ status: 503 },
		);
	let body: { discountCode?: string };
	try {
		body = (await request.json()) as { discountCode?: string };
	} catch {
		return NextResponse.json({ error: "Invalid request." }, { status: 400 });
	}
	const discountCode = body.discountCode?.trim();
	if (!discountCode || discountCode.length > 128)
		return NextResponse.json(
			{ error: "Enter a valid discount code." },
			{ status: 400 },
		);
	const cookieStore = await cookies();
	const cartId = cookieStore.get(cookieName)?.value;
	if (!cartId)
		return NextResponse.json({ error: "Your cart is empty." }, { status: 409 });
	try {
		const cart = await updateShopifyCartDiscount(cartId, [discountCode]);
		return NextResponse.json({ cart });
	} catch (error) {
		console.error("Unable to apply Shopify discount code.", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Unable to apply discount code.",
			},
			{ status: 422 },
		);
	}
}
