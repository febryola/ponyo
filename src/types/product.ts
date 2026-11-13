import type { StaticImageData } from "next/image";

export type SupplierAvailability =
	| "available"
	| "unavailable"
	| "needs_confirmation";
export type ProductImage = string | StaticImageData;
export type ProductPriceHistoryEntry = { date: string; price: number };

export type ProductVariant = {
	id: string;
	sku: string;
	title: string;
	options?: Record<string, string>;
	galleryImages?: { src: string; alt: string }[];
	previewOnly?: boolean;
	priceAmount: number;
	currency: string;
	compareAtAmount?: number;
	availability: SupplierAvailability;
};

export type Product = {
	id: string;
	sku: string;
	variantId?: string;
	variants?: ProductVariant[];
	slug: string;
	name: string;
	description: string;
	priceAmount: number;
	compareAtAmount?: number;
	currency: string;
	availability: SupplierAvailability;
	availabilityStatus?:
		| "Available"
		| "Limited"
		| "Coming Soon"
		| "Waitlist"
		| "Unavailable";
	priceHistory?: ProductPriceHistoryEntry[];
	categoryName: string;
	productType?: string;
	color?: string;
	tags?: string[];
	sizeTier?: string;
	supplierName: string;
	image: ProductImage;
	imageAlt: string;
	galleryImages?: { src: string; alt: string }[];
	categoryId?: string | null;
	brandId?: string | null;
	brandName?: string | null;
	publishedAt?: string;
	isNew?: boolean;
	artTone?: "peach" | "sage" | "lilac" | "yellow";
	size?: string;
	dimensions?: string;
	dispatchTime?: string;
	badge?: string;
};
