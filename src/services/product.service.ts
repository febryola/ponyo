import type { Product } from "@/types/product";
import { PONYO_API_BASE_URL, ponyoApi } from "@/services/ponyo-api.client";

const themeFiles = "https://ponyo-plushies.myshopify.com/cdn/shop/files";
const cdnFiles = "https://cdn.shopify.com/s/files/1/0821/0690/8783/files";
const bearImage = `${themeFiles}/maker-bear.jpg?v=1793843383`;
const bunnyImage = `${themeFiles}/maker-bunny.jpg?v=1793843383`;
const dinosaurImage = `${themeFiles}/maker-dinosaur.jpg?v=1793843384`;
const penguinImage = `${themeFiles}/maker-penguin.jpg?v=1793843384`;
const catImage = `${cdnFiles}/ponyo-11.png?v=1793843380`;
const pandaImage = `${cdnFiles}/ponyo-12.png?v=1793843385`;
const dogImage = `${themeFiles}/maker-dog.jpg?v=1793843384`;
const cloudImage = `${themeFiles}/maker-cloud.jpg?v=1793843384`;
const giantBunnyImage = `${themeFiles}/ponyo-3.png?v=1793843376`;
const chickImage = `${themeFiles}/maker-chick.jpg?v=1793843383`;
const pinkBunnyImage = `${themeFiles}/maker-pink-bunny.jpg?v=1793843384`;
const elephantImage = `${themeFiles}/ponyo-6.png?v=1793843378`;
const foxImage = `${themeFiles}/ponyo-7.png?v=1793843379`;

// Catalog-only wireframe data. Replace these examples with supplier-approved records.
const sampleProducts: Array<Omit<Product, "sku">> = [
	{
		id: "sample-hoshi-cloud-bear",
		slug: "hoshi-cloud-bear",
		name: "Hoshi Cloud Bear",
		description: "A warm, squishy cream teddy bear with a classic gingham bow.",
		priceAmount: 18800,
		currency: "JPY",
		availability: "available",
		categoryName: "Bears",
		supplierName: "Mochi & Co. · Japan",
		image: bearImage,
		imageAlt: "Warm cream teddy bear plush with a checkered bow",
		artTone: "peach",
	},
	{
		id: "sample-haneul-bunny",
		slug: "haneul-bunny",
		name: "Haneul Bunny",
		description: "A soft, long-eared bunny in cream with a blue bow.",
		priceAmount: 17800,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Bunnies",
		supplierName: "Studio Haneul · South Korea",
		image: bunnyImage,
		imageAlt: "Cream bunny plush with long ears and a blue bow",
		artTone: "sage",
	},
	{
		id: "sample-mint-dino",
		slug: "mint-dino",
		name: "Mint Dino",
		description:
			"A mint-green dinosaur with soft spikes and a friendly, curious face.",
		priceAmount: 21200,
		currency: "JPY",
		availability: "available",
		categoryName: "Characters",
		supplierName: "Gajah Rumah · Indonesia",
		image: dinosaurImage,
		imageAlt: "Mint green dinosaur plush with soft spikes",
		artTone: "lilac",
	},
	{
		id: "sample-bluebell-penguin",
		slug: "bluebell-penguin",
		name: "Bluebell Penguin",
		description: "A tiny round penguin in soft blue and snowy white.",
		priceAmount: 27500,
		currency: "JPY",
		availability: "available",
		categoryName: "Penguins",
		supplierName: "Nordkind Studio · Germany",
		image: penguinImage,
		imageAlt: "Round blue and white penguin plush",
		artTone: "yellow",
	},
	{
		id: "sample-good-things-kitty",
		slug: "good-things-ahead-kitty",
		name: "Good Things Ahead Kitty",
		description: "A cozy kitty with a soft pink bow.",
		priceAmount: 22900,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Cats",
		supplierName: "Ponyo selected maker",
		image: catImage,
		imageAlt: "Cream and taupe cat plush with a rose-colored bow",
		artTone: "peach",
	},
	{
		id: "sample-better-days-panda",
		slug: "better-days-panda",
		name: "Better Days Panda",
		description: "A classic panda look with a sweet bow.",
		priceAmount: 25600,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Pandas",
		supplierName: "Ponyo selected maker",
		image: pandaImage,
		imageAlt: "Cream and charcoal panda plush with a rose-colored bow",
		artTone: "sage",
	},
	{
		id: "sample-biscuit-bow-pup",
		slug: "biscuit-bow-pup",
		name: "Biscuit Bow Pup",
		description: "A sweet pup with floppy ears and a gingham bow.",
		priceAmount: 24500,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Puppies",
		supplierName: "Ponyo selected maker",
		image: dogImage,
		imageAlt: "Cream puppy plush with floppy caramel ears and a bow",
		artTone: "yellow",
	},
	{
		id: "sample-cloud-cat",
		slug: "cloud-cat",
		name: "Cloud Cat",
		description: "A sleepy little cat in soft cream and caramel tones.",
		priceAmount: 19600,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Cats",
		supplierName: "Ponyo selected maker",
		image: cloudImage,
		imageAlt: "Cream cat plush with caramel markings",
		artTone: "yellow",
	},
	{
		id: "sample-sunny-chick",
		slug: "sunny-chick",
		name: "Sunny Chick",
		description: "A bright little chick with a sunny yellow coat.",
		priceAmount: 14200,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Characters",
		supplierName: "Plumage Studio · Vietnam",
		image: chickImage,
		imageAlt: "Round sunny yellow chick plush",
		artTone: "yellow",
	},
	{
		id: "sample-cherry-blossom-bunny",
		slug: "cherry-blossom-bunny",
		name: "Cherry Blossom Bunny",
		description: "A rosy bunny with a little flower nestled by its ear.",
		priceAmount: 22900,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Bunnies",
		supplierName: "Studio Haneul · South Korea",
		image: pinkBunnyImage,
		imageAlt: "Pink bunny plush with a tiny flower detail",
		artTone: "peach",
	},
	{
		id: "sample-hoshi-cloud-bear-xl",
		slug: "hoshi-cloud-bear-xl",
		name: "Hoshi Cloud Bear XL",
		description:
			"The 90 cm giant version of Hoshi Cloud Bear. An extra-big cuddle buddy from Domina.",
		priceAmount: 68000,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Giant plush",
		supplierName: "Mochi & Co. · Japan",
		image: bearImage,
		imageAlt: "Warm cream teddy bear plush with a checkered bow",
		artTone: "peach",
	},
	{
		id: "sample-haneul-bunny-xl",
		slug: "haneul-bunny-xl",
		name: "Haneul Bunny XL",
		description: "A giant cream bunny standing 100 cm tall, from Domina.",
		priceAmount: 74500,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Giant plush",
		supplierName: "Studio Haneul · South Korea",
		image: giantBunnyImage,
		imageAlt: "Oversized cream bunny plush shown at room scale",
		artTone: "peach",
	},
	{
		id: "sample-baluran-elephant-xl",
		slug: "baluran-elephant-xl",
		name: "Baluran Elephant XL",
		description:
			"An extra-large 120 cm elephant plush from Domina, the centrepiece of any room.",
		priceAmount: 89000,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Giant plush",
		supplierName: "Gajah Rumah · Indonesia",
		image: elephantImage,
		imageAlt: "Oversized elephant-style plush shown with other large plush",
		artTone: "sage",
	},
	{
		id: "sample-clement-fox-xl",
		slug: "clement-the-fox-xl",
		name: "Clément the Fox XL",
		description:
			"A 70 cm fox plush from Domina: big, squishy and full of character.",
		priceAmount: 71200,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Giant plush",
		supplierName: "Renard Atelier · France",
		image: foxImage,
		imageAlt: "Oversized fox-style plush shown at scale",
		artTone: "peach",
	},
];

const storefrontPreviewMetadata: Record<
	string,
	Pick<
		Product,
		| "shopifyProductId"
		| "variantId"
		| "productType"
		| "tags"
		| "size"
		| "sizeTier"
		| "dimensions"
		| "availabilityStatus"
		| "priceHistory"
		| "supplierName"
		| "image"
	>
> = {
	"cherry-blossom-bunny": {
		shopifyProductId: 15723438178415,
		variantId: "68204276121711",
		productType: "Bunny",
		tags: ["bunny", "rare"],
		supplierName: "Ponyo",
		size: "Bunny",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-pink-bunny.jpg?v=1793843384",
	},
	"biscuit-bow-pup": {
		shopifyProductId: 15723437719663,
		variantId: "68204273926255",
		productType: "Puppy",
		tags: ["new-arrival", "puppy"],
		supplierName: "Ponyo",
		size: "Puppy",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-dog.jpg?v=1793843384",
	},
	"cloud-cat": {
		shopifyProductId: 15723437031535,
		variantId: "68204270485615",
		productType: "Cat",
		tags: ["cat"],
		supplierName: "Ponyo",
		size: "Cat",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-cloud.jpg?v=1793843384",
	},
	"sunny-chick": {
		shopifyProductId: 15723436572783,
		variantId: "68204268028015",
		productType: "Character",
		tags: ["character"],
		supplierName: "Ponyo",
		size: "Small",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-chick.jpg?v=1793843383",
	},
	"good-things-ahead-kitty": {
		shopifyProductId: 15723436212335,
		variantId: "68204266389615",
		productType: "Cat",
		availabilityStatus: "Waitlist",
		tags: ["cat", "new-arrival"],
		supplierName: "Ponyo",
		size: "Cat",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-11.png?v=1793843380",
	},
	"better-days-panda": {
		shopifyProductId: 15723435884655,
		variantId: "68204264554607",
		productType: "Panda",
		availabilityStatus: "Unavailable",
		tags: ["panda", "premium"],
		supplierName: "Ponyo",
		size: "Panda",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-12.png?v=1793843385",
	},
	"clement-the-fox-xl": {
		shopifyProductId: 15723316150383,
		variantId: "68203761762415",
		productType: "XL Plush",
		availabilityStatus: "Coming Soon",
		tags: ["character", "domina-xl"],
		size: "XL · 70 cm",
		sizeTier: "XL",
		dimensions: "70 cm",
		supplierName: "Domina",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-7.png?v=1793843379",
	},
	"baluran-elephant-xl": {
		shopifyProductId: 15723316052079,
		variantId: "68203761664111",
		productType: "XL Plush",
		availabilityStatus: "Unavailable",
		tags: ["character", "domina-xl"],
		size: "XL · 120 cm",
		sizeTier: "XL",
		dimensions: "120 cm",
		supplierName: "Domina",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-6.png?v=1793843378",
	},
	"haneul-bunny-xl": {
		shopifyProductId: 15723315986543,
		variantId: "68203761598575",
		productType: "XL Plush",
		tags: ["bunny", "domina-xl"],
		size: "XL · 100 cm",
		sizeTier: "XL",
		dimensions: "100 cm",
		availabilityStatus: "Available",
		supplierName: "Domina",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bunny.jpg?v=1793843383",
	},
	"hoshi-cloud-bear-xl": {
		shopifyProductId: 15723315855471,
		variantId: "68203761467503",
		productType: "XL Plush",
		tags: ["bear", "domina-xl"],
		size: "XL · 90 cm",
		sizeTier: "XL",
		dimensions: "90 cm",
		supplierName: "Domina",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bear.jpg?v=1793843383",
	},
	"bluebell-penguin": {
		shopifyProductId: 15723315724399,
		variantId: "68203761303663",
		productType: "Plush",
		tags: ["new-arrival", "penguin", "premium"],
		size: "Small · 25 cm",
		sizeTier: "Small",
		dimensions: "25 cm",
		supplierName: "Ponyo",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-penguin.jpg?v=1793843384",
	},
	"mint-dino": {
		shopifyProductId: 15723315658863,
		variantId: "68203761238127",
		productType: "Plush",
		tags: ["character", "new-arrival", "rare"],
		size: "Small · 28 cm",
		sizeTier: "Small",
		dimensions: "28 cm",
		supplierName: "Ponyo",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-dinosaur.jpg?v=1793843384",
	},
	"haneul-bunny": {
		shopifyProductId: 15723315560559,
		variantId: "68203761107055",
		productType: "Plush",
		tags: ["bunny", "new-arrival", "premium"],
		size: "Medium · 35 cm",
		sizeTier: "Medium",
		dimensions: "35 cm",
		supplierName: "Ponyo",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bunny.jpg?v=1793843383",
	},
	"hoshi-cloud-bear": {
		shopifyProductId: 15723315462255,
		variantId: "68203761008751",
		productType: "Plush",
		tags: ["bear", "new-arrival", "rare"],
		size: "Medium · 30 cm",
		sizeTier: "Medium",
		dimensions: "30 cm",
		supplierName: "Ponyo",
		image:
			"https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bear.jpg?v=1793843383",
	},
};

const storefrontPreviewColors: Record<string, string> = {
	"hoshi-cloud-bear": "Cream",
	"haneul-bunny": "Cream",
	"mint-dino": "Mint green",
	"bluebell-penguin": "Blue and white",
	"good-things-ahead-kitty": "Cream and taupe",
	"better-days-panda": "Cream and charcoal",
	"biscuit-bow-pup": "Cream and caramel",
	"cloud-cat": "Cream and caramel",
	"sunny-chick": "Sunny yellow",
	"cherry-blossom-bunny": "Pink",
	"hoshi-cloud-bear-xl": "Cream",
	"haneul-bunny-xl": "Cream",
	"baluran-elephant-xl": "Grey",
	"clement-the-fox-xl": "Orange and cream",
};

const storefrontPreviewStatuses: Record<
	string,
	NonNullable<Product["availabilityStatus"]>
> = {
	"hoshi-cloud-bear": "Available",
	"haneul-bunny": "Coming Soon",
	"mint-dino": "Available",
	"bluebell-penguin": "Available",
	"good-things-ahead-kitty": "Waitlist",
	"better-days-panda": "Unavailable",
	"biscuit-bow-pup": "Available",
	"cloud-cat": "Available",
	"sunny-chick": "Available",
	"cherry-blossom-bunny": "Waitlist",
	"hoshi-cloud-bear-xl": "Available",
	"haneul-bunny-xl": "Waitlist",
	"baluran-elephant-xl": "Unavailable",
	"clement-the-fox-xl": "Coming Soon",
};

const storefrontPreviewPriceHistory: Product["priceHistory"] = [
	{ date: "2026-11-09", price: 18800 },
];

export const storefrontPreviewProducts = sampleProducts.map((product) => ({
	...product,
	color: storefrontPreviewColors[product.slug],
	sku: `PNY-${product.slug
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`,
	...storefrontPreviewMetadata[product.slug],
	availabilityStatus: storefrontPreviewStatuses[product.slug],
	priceHistory:
		product.slug === "hoshi-cloud-bear" ? storefrontPreviewPriceHistory : [],
	publishedAt: "2026-11-05T15:00:00+09:00",
	isNew: true,
	galleryImages: [
		{
			src:
				typeof storefrontPreviewMetadata[product.slug]?.image === "string"
					? (storefrontPreviewMetadata[product.slug].image as string)
					: product.image instanceof Object
						? product.image.src
						: String(product.image),
			alt: product.imageAlt,
		},
	],
	availability: (storefrontPreviewMetadata[product.slug]?.availabilityStatus ===
		"Available" || !storefrontPreviewMetadata[product.slug]?.availabilityStatus
		? "available"
		: "unavailable") as Product["availability"],
}));

export async function getProducts(query = ""): Promise<Product[]> {
	if (PONYO_API_BASE_URL) return ponyoApi.listProducts(query);
	return storefrontPreviewProducts;
}

export async function getProductById(id: string): Promise<Product | undefined> {
	if (PONYO_API_BASE_URL) {
		try {
			return await ponyoApi.getProduct(id);
		} catch {
			return undefined;
		}
	}
	const products = await getProducts();
	return products.find((product) => product.id === id);
}
