import type { Product } from "@/types/product";
import { PONYO_API_BASE_URL, ponyoApi } from "@/services/ponyo-api.client";

const localImage = (filename: string) => `/images/catalog/${filename}`;
const bearImage = localImage("maker-bear.jpg");
const bunnyImage = localImage("maker-bunny.jpg");
const dinosaurImage = localImage("maker-dinosaur.jpg");
const penguinImage = localImage("maker-penguin.jpg");
const catImage = localImage("ponyo-11.png");
const pandaImage = localImage("ponyo-12.png");
const dogImage = localImage("maker-dog.jpg");
const cloudImage = localImage("maker-cloud.jpg");
const giantBunnyImage = localImage("ponyo-3.png");
const chickImage = localImage("maker-chick.jpg");
const pinkBunnyImage = localImage("maker-pink-bunny.jpg");
const elephantImage = localImage("ponyo-6.png");
const foxImage = localImage("ponyo-7.png");

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
		productType: "Bunny",
		tags: ["bunny", "rare", "limited-edition"],
		supplierName: "Ponyo",
		size: "Bunny",
		image: localImage("maker-pink-bunny.jpg"),
	},
	"biscuit-bow-pup": {
		productType: "Puppy",
		tags: ["new-arrival", "puppy"],
		supplierName: "Ponyo",
		size: "Puppy",
		image: localImage("maker-dog.jpg"),
	},
	"cloud-cat": {
		productType: "Cat",
		tags: ["cat", "rare", "limited-edition"],
		supplierName: "Ponyo",
		size: "Cat",
		image: localImage("maker-cloud.jpg"),
	},
	"sunny-chick": {
		productType: "Character",
		tags: ["character"],
		supplierName: "Ponyo",
		size: "Small",
		image: localImage("maker-chick.jpg"),
	},
	"good-things-ahead-kitty": {
		productType: "Cat",
		availabilityStatus: "Waitlist",
		tags: ["cat", "new-arrival"],
		supplierName: "Ponyo",
		size: "Cat",
		image: localImage("ponyo-11.png"),
	},
	"better-days-panda": {
		productType: "Panda",
		availabilityStatus: "Available",
		tags: ["panda", "premium", "rare"],
		supplierName: "Ponyo",
		size: "Panda",
		image: localImage("ponyo-12.png"),
	},
	"clement-the-fox-xl": {
		productType: "XL Plush",
		availabilityStatus: "Coming Soon",
		tags: ["character", "domina-xl"],
		size: "XL · 70 cm",
		sizeTier: "XL",
		dimensions: "70 cm",
		supplierName: "Domina",
		image: localImage("ponyo-7.png"),
	},
	"baluran-elephant-xl": {
		productType: "XL Plush",
		availabilityStatus: "Unavailable",
		tags: ["character", "domina-xl"],
		size: "XL · 120 cm",
		sizeTier: "XL",
		dimensions: "120 cm",
		supplierName: "Domina",
		image: localImage("ponyo-6.png"),
	},
	"haneul-bunny-xl": {
		productType: "XL Plush",
		tags: ["bunny", "domina-xl"],
		size: "XL · 100 cm",
		sizeTier: "XL",
		dimensions: "100 cm",
		availabilityStatus: "Available",
		supplierName: "Domina",
		image: localImage("maker-bunny.jpg"),
	},
	"hoshi-cloud-bear-xl": {
		productType: "XL Plush",
		tags: ["bear", "domina-xl"],
		size: "XL · 90 cm",
		sizeTier: "XL",
		dimensions: "90 cm",
		supplierName: "Domina",
		image: localImage("maker-bear.jpg"),
	},
	"bluebell-penguin": {
		productType: "Plush",
		tags: ["new-arrival", "penguin", "premium"],
		size: "Small · 25 cm",
		sizeTier: "Small",
		dimensions: "25 cm",
		supplierName: "Ponyo",
		image: localImage("maker-penguin.jpg"),
	},
	"mint-dino": {
		productType: "Plush",
		tags: ["character", "new-arrival", "rare"],
		size: "Small · 28 cm",
		sizeTier: "Small",
		dimensions: "28 cm",
		supplierName: "Ponyo",
		image: localImage("maker-dinosaur.jpg"),
	},
	"haneul-bunny": {
		productType: "Plush",
		tags: ["bunny", "new-arrival", "premium"],
		size: "Medium · 35 cm",
		sizeTier: "Medium",
		dimensions: "35 cm",
		supplierName: "Ponyo",
		image: localImage("maker-bunny.jpg"),
	},
	"hoshi-cloud-bear": {
		productType: "Plush",
		tags: ["bear", "new-arrival", "rare"],
		size: "Medium · 30 cm",
		sizeTier: "Medium",
		dimensions: "30 cm",
		supplierName: "Ponyo",
		image: localImage("maker-bear.jpg"),
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
	"better-days-panda": "Available",
	"biscuit-bow-pup": "Available",
	"cloud-cat": "Available",
	"sunny-chick": "Available",
	"cherry-blossom-bunny": "Available",
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

export async function getProducts(
	query = "",
	locale = "en",
): Promise<Product[]> {
	if (PONYO_API_BASE_URL) return ponyoApi.listProducts(query, locale);
	return storefrontPreviewProducts;
}

export async function getProductById(
	id: string,
	locale = "en",
): Promise<Product | undefined> {
	if (PONYO_API_BASE_URL) {
		try {
			return await ponyoApi.getProduct(id, locale);
		} catch {
			return undefined;
		}
	}
	const products = await getProducts("", locale);
	return products.find((product) => product.id === id);
}
