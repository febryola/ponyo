import type { StaticImageData } from "next/image";

export type SupplierAvailability =
	| "available"
	| "unavailable"
	| "needs_confirmation";
export type ProductImage = string | StaticImageData;

export type Product = {
	id: string;
	slug: string;
	name: string;
	description: string;
	priceAmount: number;
	currency: string;
	availability: SupplierAvailability;
	categoryName: string;
	supplierName: string;
	image: ProductImage;
	imageAlt: string;
	artTone: "peach" | "sage" | "lilac" | "yellow";
	size?: string;
	badge?: string;
};
