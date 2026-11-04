import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Product, SupplierAvailability } from "@/types/product";
import bearImage from "@/sample-frontend/images/crop/maker-bear.jpg";
import bunnyImage from "@/sample-frontend/images/crop/maker-bunny.jpg";
import dinosaurImage from "@/sample-frontend/images/crop/maker-dinosaur.jpg";
import penguinImage from "@/sample-frontend/images/crop/maker-penguin.jpg";
import catImage from "@/sample-frontend/images/11.png";
import pandaImage from "@/sample-frontend/images/12.png";
import dogImage from "@/sample-frontend/images/crop/maker-dog.jpg";
import cloudImage from "@/sample-frontend/images/crop/maker-cloud.jpg";
import giantBunnyImage from "@/sample-frontend/images/3.png";
import chickImage from "@/sample-frontend/images/crop/maker-chick.jpg";
import pinkBunnyImage from "@/sample-frontend/images/crop/maker-pink-bunny.jpg";
import elephantImage from "@/sample-frontend/images/6.png";
import foxImage from "@/sample-frontend/images/7.png";

// Catalog-only wireframe data. Replace these examples with supplier-approved records.
const sampleProducts: Product[] = [
	{
		id: "sample-hoshi-cloud-bear",
		slug: "hoshi-cloud-bear",
		name: "Hoshi Cloud Bear",
		description:
			"A warm, cuddly bear with a classic little bow, selected from the Ponyo wireframe collection.",
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
		description:
			"A floppy-eared friend in soft cream, selected from the Ponyo wireframe collection.",
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
			"A minty-green dinosaur with a friendly, curious look, selected from the Ponyo wireframe collection.",
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
		description:
			"A round little penguin in soft blue and snowy white, selected from the Ponyo wireframe collection.",
		priceAmount: 27500,
		currency: "JPY",
		availability: "available",
		categoryName: "Characters",
		supplierName: "Nordkind Studio · Germany",
		image: penguinImage,
		imageAlt: "Round blue and white penguin plush",
		artTone: "yellow",
	},
	{
		id: "sample-good-things-kitty",
		slug: "good-things-ahead-kitty",
		name: "Good Things Ahead Kitty",
		description:
			"A cozy kitty with a soft pink bow, selected from the Ponyo wireframe collection.",
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
		description:
			"A classic panda look with a sweet bow, selected from the Ponyo wireframe collection.",
		priceAmount: 25600,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Characters",
		supplierName: "Ponyo selected maker",
		image: pandaImage,
		imageAlt: "Cream and charcoal panda plush with a rose-colored bow",
		artTone: "sage",
	},
	{
		id: "sample-biscuit-bow-pup",
		slug: "biscuit-bow-pup",
		name: "Biscuit Bow Pup",
		description:
			"A sweet pup with floppy ears and gingham, selected from the Ponyo wireframe collection.",
		priceAmount: 24500,
		currency: "JPY",
		availability: "needs_confirmation",
		categoryName: "Characters",
		supplierName: "Ponyo selected maker",
		image: dogImage,
		imageAlt: "Cream puppy plush with floppy caramel ears and a bow",
		artTone: "yellow",
	},
	{
		id: "sample-cloud-cat",
		slug: "cloud-cat",
		name: "Cloud Cat",
		description:
			"A sleepy little cat in cream and caramel tones, selected from the Ponyo wireframe collection.",
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
		name: "Hoshi Cloud Bear XL — 90cm",
		description:
			"An oversized 90cm version of the Hoshi Cloud Bear from the Ponyo wireframe collection.",
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
		name: "Haneul Bunny XL — 100cm",
		description:
			"An oversized 100cm Haneul Bunny from the Ponyo wireframe collection.",
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
		name: "Baluran Elephant XL — 120cm",
		description: "An oversized elephant plush with a memorable 120cm presence.",
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
		slug: "clement-fox-xl",
		name: "Clément the Fox XL — 70cm",
		description: "A distinctive oversized fox plush in a compact 70cm XL size.",
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

type ProductRow = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	price_amount: number;
	currency: string;
	availability: SupplierAvailability;
	categories: { name: string; slug: string } | null;
	product_images: {
		image_url: string;
		alt_text: string | null;
		sort_order: number;
	}[];
};

function mapProduct(row: ProductRow, index: number): Product {
	const defaults = sampleProducts[index % sampleProducts.length];
	const image = [...(row.product_images ?? [])].sort(
		(a, b) => a.sort_order - b.sort_order,
	)[0];
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description ?? "Product details will be added soon.",
		priceAmount: Number(row.price_amount),
		currency: row.currency,
		availability: row.availability,
		categoryName: row.categories?.name ?? "Plushie",
		supplierName: "Selected supplier",
		image: image?.image_url ?? defaults.image,
		imageAlt: image?.alt_text ?? defaults.imageAlt,
		artTone: defaults.artTone,
	};
}

export async function getProducts(): Promise<Product[]> {
	const supabase = getSupabaseServerClient();
	if (!supabase) return sampleProducts;

	const { data, error } = await supabase
		.from("products")
		.select(
			"id, slug, name, description, price_amount, currency, availability, categories(name, slug), product_images(image_url, alt_text, sort_order)",
		)
		.eq("published", true)
		.order("created_at", { ascending: false });

	if (error) {
		console.error(
			"Unable to load products from Supabase; using sample catalog.",
			error.message,
		);
		return sampleProducts;
	}

	return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
}

export async function getProductBySlug(
	slug: string,
): Promise<Product | undefined> {
	const products = await getProducts();
	return products.find((product) => product.slug === slug);
}
