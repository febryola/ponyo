const shopDomain = (
	process.env.SHOPIFY_STORE_DOMAIN ?? "ponyo-plushies.myshopify.com"
)
	.replace(/^https?:\/\//, "")
	.replace(/\/$/, "");

export type DesiredCartLine = { variantId: string; quantity: number };
export type ShopifyCartLine = {
	id: string;
	quantity: number;
	merchandise: {
		id: string;
		title: string;
		price: { amount: string; currencyCode: string };
		product: {
			id: string;
			title: string;
			handle: string;
			vendor: string;
			featuredImage: { url: string; altText: string | null } | null;
		};
	};
};
export type ShopifyCart = {
	id: string;
	checkoutUrl: string;
	totalQuantity: number;
	cost: { subtotalAmount: { amount: string; currencyCode: string } };
	lines: { nodes: ShopifyCartLine[] };
};

type GraphResponse<T> = { data?: T; errors?: { message: string }[] };

async function graphql<T>(
	query: string,
	variables: Record<string, unknown> = {},
) {
	const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
	if (!token)
		throw new Error("Shopify Storefront API token is not configured.");
	const response = await fetch(
		`https://${shopDomain}/api/2026-10/graphql.json`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"X-Shopify-Storefront-Access-Token": token,
			},
			body: JSON.stringify({ query, variables }),
			cache: "no-store",
		},
	);
	if (!response.ok)
		throw new Error(`Shopify Cart API returned ${response.status}`);
	const result = (await response.json()) as GraphResponse<T>;
	if (result.errors?.length)
		throw new Error(result.errors.map((error) => error.message).join("; "));
	if (!result.data) throw new Error("Shopify Cart API returned no data.");
	return result.data;
}

const cartFields = `id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } } lines(first: 100) { nodes { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } product { id title handle vendor featuredImage { url altText } } } } } }`;

export async function getShopifyCart(
	cartId: string,
): Promise<ShopifyCart | null> {
	const result = await graphql<{ cart: ShopifyCart | null }>(
		`query PonyoCart($id: ID!) { cart(id: $id) { ${cartFields} } }`,
		{ id: cartId },
	);
	return result.cart;
}

export async function updateShopifyCartDiscount(
	cartId: string,
	discountCodes: string[],
) {
	const result = await graphql<{
		cartDiscountCodesUpdate: {
			cart: ShopifyCart | null;
			userErrors: { message: string }[];
		};
	}>(
		`mutation PonyoCartDiscount($cartId: ID!, $discountCodes: [String!]!) { cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) { cart { ${cartFields} } userErrors { message } } }`,
		{ cartId, discountCodes },
	);
	if (result.cartDiscountCodesUpdate.userErrors.length) {
		throw new Error(
			result.cartDiscountCodesUpdate.userErrors
				.map((error) => error.message)
				.join("; "),
		);
	}
	if (!result.cartDiscountCodesUpdate.cart)
		throw new Error("Shopify could not apply the discount code.");
	return result.cartDiscountCodesUpdate.cart;
}

export async function syncShopifyCart(
	cartId: string | undefined,
	desiredLines: DesiredCartLine[],
) {
	const lines = desiredLines
		.filter(
			(line) =>
				/^\d+$/.test(line.variantId) &&
				Number.isInteger(line.quantity) &&
				line.quantity > 0,
		)
		.map((line) => ({
			merchandiseId: `gid://shopify/ProductVariant/${line.variantId}`,
			quantity: Math.min(99, line.quantity),
		}));

	if (!cartId) {
		const result = await graphql<{
			cartCreate: {
				cart: ShopifyCart | null;
				userErrors: { message: string }[];
			};
		}>(
			`mutation PonyoCartCreate($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { ${cartFields} } userErrors { message } } }`,
			{ lines },
		);
		const response = result.cartCreate;
		if (response.userErrors.length)
			throw new Error(
				response.userErrors.map((error) => error.message).join("; "),
			);
		if (!response.cart) throw new Error("Shopify could not create the cart.");
		return response.cart;
	}

	const existingCart = await getShopifyCart(cartId);
	if (!existingCart) return syncShopifyCart(undefined, desiredLines);
	const desiredByVariant = new Map(
		lines.map((line) => [line.merchandiseId, line.quantity]),
	);
	const currentByVariant = new Map<string, ShopifyCartLine>();
	for (const line of existingCart.lines.nodes)
		currentByVariant.set(line.merchandise.id, line);

	const updates = [...currentByVariant.entries()]
		.filter(([variantId]) => desiredByVariant.has(variantId))
		.map(([variantId, line]) => ({
			id: line.id,
			quantity: desiredByVariant.get(variantId)!,
		}));
	const removals = [...currentByVariant.entries()]
		.filter(([variantId]) => !desiredByVariant.has(variantId))
		.map(([, line]) => line.id);
	const additions = lines.filter(
		(line) => !currentByVariant.has(line.merchandiseId),
	);

	let nextCart = existingCart;
	if (updates.length) {
		const result = await graphql<{
			cartLinesUpdate: {
				cart: ShopifyCart | null;
				userErrors: { message: string }[];
			};
		}>(
			`mutation PonyoCartUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${cartFields} } userErrors { message } } }`,
			{ cartId, lines: updates },
		);
		if (result.cartLinesUpdate.userErrors.length)
			throw new Error(
				result.cartLinesUpdate.userErrors
					.map((error) => error.message)
					.join("; "),
			);
		if (result.cartLinesUpdate.cart) nextCart = result.cartLinesUpdate.cart;
	}
	if (removals.length) {
		const result = await graphql<{
			cartLinesRemove: {
				cart: ShopifyCart | null;
				userErrors: { message: string }[];
			};
		}>(
			`mutation PonyoCartRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${cartFields} } userErrors { message } } }`,
			{ cartId, lineIds: removals },
		);
		if (result.cartLinesRemove.userErrors.length)
			throw new Error(
				result.cartLinesRemove.userErrors
					.map((error) => error.message)
					.join("; "),
			);
		if (result.cartLinesRemove.cart) nextCart = result.cartLinesRemove.cart;
	}
	if (additions.length) {
		const result = await graphql<{
			cartLinesAdd: {
				cart: ShopifyCart | null;
				userErrors: { message: string }[];
			};
		}>(
			`mutation PonyoCartAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${cartFields} } userErrors { message } } }`,
			{ cartId, lines: additions },
		);
		if (result.cartLinesAdd.userErrors.length)
			throw new Error(
				result.cartLinesAdd.userErrors.map((error) => error.message).join("; "),
			);
		if (result.cartLinesAdd.cart) nextCart = result.cartLinesAdd.cart;
	}
	return nextCart;
}
