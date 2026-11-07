import type { Product } from "@/types/product";

const shopDomain = (
	process.env.SHOPIFY_STORE_DOMAIN ?? "ponyo-plushies.myshopify.com"
)
	.replace(/^https?:\/\//, "")
	.replace(/\/$/, "");

export type ShopifyVariant = {
	id: string | number;
	title: string;
	price: string;
	available: boolean;
	compare_at_price: string | null;
};

export type ShopifyProductRecord = {
	id: string | number;
	title: string;
	handle: string;
	published_at?: string | null;
	body_html: string | null;
	vendor: string;
	product_type: string;
	tags: string[];
	availability_status?: string | null;
	size_tier?: string | null;
	dimensions?: string | null;
	dispatch_time?: string | null;
	variants: ShopifyVariant[];
	images: { src: string; alt?: string | null }[];
};

type ShopifyProductsResponse = { products: ShopifyProductRecord[] };

function cleanDescription(html: string | null) {
	return (html ?? "")
		.replace(/<\/(p|div|li|h[1-6])>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function categoryFor(product: ShopifyProductRecord) {
	const tags = product.tags.map((tag) => tag.toLowerCase());
	if (tags.includes("domina-xl")) return "Giant plush";
	const categories: Record<string, string> = {
		bunny: "Bunnies",
		bear: "Bears",
		cat: "Cats",
		panda: "Pandas",
		puppy: "Puppies",
		penguin: "Penguins",
		character: "Cute Characters",
	};
	for (const tag of tags) {
		if (categories[tag]) return categories[tag];
	}
	return categories[product.product_type.toLowerCase()] ?? "Cute Characters";
}

function sizeFor(product: ShopifyProductRecord) {
	if (product.size_tier)
		return `${product.size_tier}${product.dimensions ? ` · ${product.dimensions}` : ""}`;
	if (!product.tags.some((tag) => tag.toLowerCase() === "domina-xl"))
		return undefined;
	const size = product.body_html?.match(/\b(\d{2,3})\s*cm\b/i)?.[1];
	return size ? `XL · ${size} cm` : "XL plush";
}

function toneFor(product: ShopifyProductRecord): Product["artTone"] {
	const type = product.product_type.toLowerCase();
	if (type === "bunny") return "peach";
	if (type === "bear" || type === "panda") return "sage";
	if (type === "penguin" || type === "character") return "lilac";
	return "yellow";
}

export function mapShopifyProduct(
	product: ShopifyProductRecord,
): Product | undefined {
	const variant = product.variants[0];
	const image = product.images[0];
	if (!variant || !image) return undefined;

	const publishedAt = product.published_at ?? undefined;
	const publishedAgeDays = publishedAt
		? (Date.now() - new Date(publishedAt).getTime()) / 86_400_000
		: Number.POSITIVE_INFINITY;
	return {
		id: String(product.id),
		shopifyProductId:
			typeof product.id === "number"
				? product.id
				: Number(product.id.split("/").at(-1)) || undefined,
		variantId:
			typeof variant.id === "number"
				? String(variant.id)
				: (variant.id.split("/").at(-1) ?? variant.id),
		slug: product.handle,
		name: product.title,
		description:
			cleanDescription(product.body_html) ||
			"A soft friend, carefully chosen by Ponyo.",
		priceAmount: Number(variant.price),
		compareAtAmount: variant.compare_at_price
			? Number(variant.compare_at_price)
			: undefined,
		currency: "JPY",
		availability: variant.available ? "available" : "unavailable",
		availabilityStatus:
			product.availability_status === "Limited" ||
			product.availability_status === "Coming Soon"
				? product.availability_status
				: "Available",
		categoryName: categoryFor(product),
		productType: product.product_type,
		tags: product.tags,
		sizeTier: product.size_tier ?? undefined,
		supplierName: product.vendor,
		image: image.src,
		imageAlt: image.alt || product.title,
		galleryImages: product.images.map((item) => ({
			src: item.src,
			alt: item.alt || product.title,
		})),
		publishedAt,
		isNew: product.tags.includes("new-arrival") || publishedAgeDays < 30,
		artTone: toneFor(product),
		size: sizeFor(product),
		dimensions: product.dimensions ?? undefined,
		dispatchTime: product.dispatch_time ?? undefined,
	};
}

export async function fetchShopifyCatalog({
	fresh = false,
}: { fresh?: boolean } = {}): Promise<ShopifyProductRecord[]> {
	const storefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
	if (storefrontToken) {
		const query = `query PonyoCatalog { products(first: 250, sortKey: UPDATED_AT, reverse: true) { nodes { id title handle publishedAt descriptionHtml vendor productType tags availabilityStatus: metafield(namespace: "ponyo", key: "availability_status") { value } sizeTier: metafield(namespace: "ponyo", key: "size_tier") { value } dimensions: metafield(namespace: "ponyo", key: "dimensions") { value } dispatchTime: metafield(namespace: "ponyo", key: "dispatch_time") { value } variants(first: 1) { nodes { id title price { amount } compareAtPrice { amount } availableForSale } } images(first: 10) { nodes { url altText } } } } }`;
		const response = await fetch(
			`https://${shopDomain}/api/2026-10/graphql.json?query=${encodeURIComponent(query)}`,
			{
				headers: {
					Accept: "application/json",
					"X-Shopify-Storefront-Access-Token": storefrontToken,
				},
				...(fresh
					? { cache: "no-store" as const }
					: { next: { revalidate: 300 } }),
			},
		);
		if (!response.ok) {
			const error = new Error(
				`Shopify Storefront API returned ${response.status}`,
			);
			Object.assign(error, { status: response.status });
			throw error;
		}
		const data = (await response.json()) as {
			data?: {
				products?: {
					nodes?: {
						id: string;
						title: string;
						handle: string;
						publishedAt: string;
						descriptionHtml: string;
						vendor: string;
						productType: string;
						tags: string[];
						availabilityStatus: { value: string } | null;
						sizeTier: { value: string } | null;
						dimensions: { value: string } | null;
						dispatchTime: { value: string } | null;
						variants: {
							nodes: {
								id: string;
								title: string;
								price: { amount: string };
								compareAtPrice: { amount: string } | null;
								availableForSale: boolean;
							}[];
						};
						images: { nodes: { url: string; altText: string | null }[] };
					}[];
				};
			};
			errors?: { message: string }[];
		};
		if (data.errors?.length) {
			throw new Error(data.errors.map((error) => error.message).join("; "));
		}
		return (data.data?.products?.nodes ?? []).map((product) => ({
			id: product.id,
			title: product.title,
			handle: product.handle,
			published_at: product.publishedAt,
			body_html: product.descriptionHtml,
			vendor: product.vendor,
			product_type: product.productType,
			tags: product.tags,
			availability_status: product.availabilityStatus?.value,
			size_tier: product.sizeTier?.value,
			dimensions: product.dimensions?.value,
			dispatch_time: product.dispatchTime?.value,
			variants: product.variants.nodes.map((variant) => ({
				id: variant.id,
				title: variant.title,
				price: variant.price.amount,
				available: variant.availableForSale,
				compare_at_price: variant.compareAtPrice?.amount ?? null,
			})),
			images: product.images.nodes.map((image) => ({
				src: image.url,
				alt: image.altText,
			})),
		}));
	}

	const response = await fetch(
		`https://${shopDomain}/products.json?limit=250`,
		{
			headers: { Accept: "application/json" },
			...(fresh
				? { cache: "no-store" as const }
				: { next: { revalidate: 300 } }),
		},
	);
	if (!response.ok) {
		const error = new Error(`Shopify catalog returned ${response.status}`);
		Object.assign(error, { status: response.status });
		throw error;
	}
	const data = (await response.json()) as ShopifyProductsResponse;
	return Array.isArray(data.products) ? data.products : [];
}

export async function getShopifyProducts(): Promise<Product[]> {
	try {
		const records = await fetchShopifyCatalog();
		return records
			.map(mapShopifyProduct)
			.filter((product): product is Product => Boolean(product));
	} catch (error) {
		if (
			!(
				error instanceof Error &&
				"status" in error &&
				(error as Error & { status: number }).status === 401
			)
		) {
			console.error("Unable to load the public Shopify catalog.", error);
		}
		return [];
	}
}

export function getShopifyStoreDomain() {
	return shopDomain;
}
