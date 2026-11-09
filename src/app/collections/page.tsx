import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";

const collections = [
	{
		title: "RARE Finds",
		slug: "rare-finds",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-pink-bunny.jpg?v=1793843384",
	},
	{
		title: "Premium Plushies",
		slug: "premium",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-5.png?v=1793843377",
	},
	{
		title: "XL Goodies",
		slug: "domina-xl",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-3.png?v=1793843376",
	},
	{
		title: "New Arrivals",
		slug: "new-arrivals",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-6.png?v=1793843378",
	},
	{
		title: "Bears",
		slug: "bears",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-bear.jpg?v=1793843383",
	},
	{
		title: "Bunnies",
		slug: "bunnies",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-bunny.jpg?v=1793843383",
	},
	{
		title: "Cats",
		slug: "cats",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-cat.jpg?v=1793843383",
	},
	{
		title: "Cute Characters",
		slug: "characters",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-dinosaur.jpg?v=1793843384",
	},
	{
		title: "Pandas",
		slug: "pandas",
		image: "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-12.png?v=1793843385",
	},
	{
		title: "Puppies",
		slug: "puppies",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-dog.jpg?v=1793843384",
	},
	{
		title: "Penguins",
		slug: "penguins",
		image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/maker-penguin.jpg?v=1793843384",
	},
];

export const metadata = { title: "Collections" };

export default function CollectionsPage() {
	return (
		<SiteFrame className="store-page">
			<div className="store-container collections-index">
				<header>
					<p className="eyebrow">PONYO COLLECTIONS</p>
					<h1>Find your kind of plush</h1>
					<p>Browse plush by type, size, and what you are hunting for.</p>
				</header>
				<div className="collections-index-grid">
					{collections.map((collection) => (
						<Link
							href={`/collections/${collection.slug}`}
							key={collection.slug}
						>
							<Image
								src={collection.image}
								alt=""
								fill
								sizes="(max-width: 700px) 45vw, 25vw"
							/>
						</Link>
					))}
				</div>
				<Link
					className="shop-button shop-button-orange"
					href="/collections/all"
				>
					Shop all plush <b>→</b>
				</Link>
			</div>
		</SiteFrame>
	);
}
