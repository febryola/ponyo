import type { Product, ProductVariant } from "@/types/product";

const demoBunnyPinkImage = "/images/catalog/maker-pink-bunny.jpg";

/** Local UI fixture only; replace it with supplier variant media once real data is available. */
export function withProductVariantDemo(product: Product): Product {
	if (product.slug !== "haneul-bunny") return product;

	const base = product.variants?.[0] ?? {
		id: product.variantId ?? product.id,
		sku: product.sku,
		title: product.name,
		priceAmount: product.priceAmount,
		currency: product.currency,
		compareAtAmount: product.compareAtAmount,
		availability: product.availability,
	};
	const defaultGallery = product.galleryImages?.length
		? product.galleryImages
		: [{ src: typeof product.image === "string" ? product.image : product.image.src, alt: product.imageAlt }];
	const defaultOptions = { ...base.options, Size: base.options?.Size ?? product.size ?? "Medium", Color: "Cream" };
	const cream: ProductVariant = {
		...base,
		id: `${base.id}-preview-cream`,
		title: `${product.name} · Cream (preview)`,
		availability: "available",
		options: defaultOptions,
		galleryImages: defaultGallery,
		previewOnly: true,
	};
	const pink: ProductVariant = {
		...base,
		id: `${base.id}-preview-pink`,
		sku: `${base.sku}-PREVIEW-PINK`,
		title: `${product.name} · Pink (preview)`,
		availability: "available",
		options: { ...defaultOptions, Color: "Pink" },
		galleryImages: [{ src: demoBunnyPinkImage, alt: "Sample pink color option for Haneul Bunny" }],
		previewOnly: true,
	};

	return { ...product, color: "Cream", variantId: cream.id, variants: [cream, pink] };
}