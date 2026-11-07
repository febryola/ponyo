import type { StaticImageData } from "next/image";

export type SupplierAvailability =
	| "available"
	| "unavailable"
	| "needs_confirmation";
export type ProductImage = string | StaticImageData;

export type ProductVariant = {
	id: string;
	title: string;
	priceAmount: number;
	currency: string;
	compareAtAmount?: number;
	availability: SupplierAvailability;
};

export type Product = {
	id: string;
	shopifyProductId?: number;
	variantId?: string;
	variants?: ProductVariant[];
	slug: string;
	name: string;
	description: string;
	priceAmount: number;
	compareAtAmount?: number;
	currency: string;
	availability: SupplierAvailability;
	availabilityStatus?: "Available" | "Limited" | "Coming Soon";
	categoryName: string;
	productType?: string;
	tags?: string[];
	sizeTier?: string;
	supplierName: string;
	image: ProductImage;
	imageAlt: string;
	galleryImages?: { src: string; alt: string }[];
	publishedAt?: string;
	isNew?: boolean;
	artTone?: "peach" | "sage" | "lilac" | "yellow";
	size?: string;
	dimensions?: string;
	dispatchTime?: string;
	badge?: string;
};
