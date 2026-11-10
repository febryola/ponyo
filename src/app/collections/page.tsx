import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { getLocalizedProducts } from "@/services/localized-products.server";
import type { Product } from "@/types/product";

const featuredCollections = [
	{ title: "RARE Finds", slug: "rare-finds", tag: "rare", eyebrow: "Hard to find", description: "Discontinued favorites and limited-edition plush.", tone: "rare", fallback: "/images/catalog/maker-pink-bunny.jpg" },
	{ title: "Premium Plushies", slug: "premium", tag: "premium", eyebrow: "A little extra lovely", description: "Distinctive details, soft finishes, lasting favorites.", tone: "premium", fallback: "/images/catalog/ponyo-5.png" },
	{ title: "XL Goodies", slug: "domina-xl", tag: "domina-xl", eyebrow: "Think bigger", description: "Big-hearted companions, from 70 cm to 120 cm.", tone: "xl", fallback: "/images/catalog/ponyo-3.png" },
	{ title: "New Arrivals", slug: "new-arrivals", tag: "new-arrival", eyebrow: "Just landed", description: "Meet the newest plush friends to join Ponyo.", tone: "new", fallback: "/images/catalog/ponyo-6.png" },
] as const;

const animalCollections = [
	{ title: "Bears", slug: "bears", tag: "bear", fallback: "/images/catalog/maker-bear.jpg" },
	{ title: "Bunnies", slug: "bunnies", tag: "bunny", fallback: "/images/catalog/maker-bunny.jpg" },
	{ title: "Cats", slug: "cats", tag: "cat", fallback: "/images/catalog/maker-cat.jpg" },
	{ title: "Cute Characters", slug: "characters", tag: "character", fallback: "/images/catalog/maker-dinosaur.jpg" },
	{ title: "Pandas", slug: "pandas", tag: "panda", fallback: "/images/catalog/ponyo-12.png" },
	{ title: "Puppies", slug: "puppies", tag: "puppy", fallback: "/images/catalog/maker-dog.jpg" },
	{ title: "Penguins", slug: "penguins", tag: "penguin", fallback: "/images/catalog/maker-penguin.jpg" },
] as const;

function productsForTag(products: Product[], tag: string) {
	return products.filter((product) => product.tags?.some((item) => item.toLowerCase() === tag) || product.categoryName.toLowerCase() === tag);
}

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
	const products = await getLocalizedProducts();
	const heroImages = products.filter((product) => Boolean(product.image)).slice(0, 2);
	const newArrivals = productsForTag(products, "new-arrival");
	const featuredProducts = [...newArrivals, ...products.filter((product) => !newArrivals.some((arrival) => arrival.id === product.id))].slice(0, 4);
	return (
		<SiteFrame className="store-page collections-landing-page">
			<div className="collections-landing">
				<header className="collections-landing-hero">
					<div className="collections-landing-hero-copy">
						<p className="eyebrow">THE PONYO COLLECTION</p>
						<h1>Find your next <em>forever friend.</em></h1>
						<p>Explore rare discoveries, premium favorites, and plush companions of every size—all thoughtfully gathered in one place.</p>
						<div className="collections-landing-actions">
							<Link className="shop-button shop-button-orange" href="/collections/all">Shop all plush <b>→</b></Link>
							<a className="collections-size-link" href="#shop-by-size">Explore by size <span aria-hidden="true">↓</span></a>
						</div>
					</div>
					<div className="collections-landing-hero-bubble" aria-hidden="true"><Image src="/images/catalog/maker-penguin.jpg" alt="" fill priority sizes="(max-width: 767px) 68px, 132px" /></div>
					<div className="collections-landing-hero-art" aria-hidden="true"><span className="collections-landing-orbit"/><Image src={heroImages[0]?.image ?? "/images/plushies-home-2.png"} alt="" fill sizes="(max-width: 767px) 34vw, 320px" priority/><span className="collections-landing-stamp">Picked with<br/>a little love</span></div>
				</header>

				<section className="collections-featured" aria-labelledby="collections-featured-title">
					<div className="collections-section-heading"><div><p className="eyebrow">A PLACE TO BEGIN</p><h2 id="collections-featured-title">Explore our collections</h2><p>Find a plush that feels like you.</p></div><Link href="/collections/all">View everything <span aria-hidden="true">→</span></Link></div>
					<div className="collections-featured-grid">{featuredCollections.map((collection) => {
						const matching = productsForTag(products, collection.tag);
						return <Link className={`collections-feature-card collections-feature-card--${collection.tone}`} href={`/collections/${collection.slug}`} key={collection.slug}>
							<Image src={matching[0]?.image ?? collection.fallback} alt="" fill sizes="(max-width: 767px) 48vw, 25vw" />
							<span className="collections-feature-shade" />
							<span className="collections-feature-copy"><small>{collection.eyebrow}</small><strong>{collection.title}</strong><span>{collection.description}</span><b>{matching.length} {matching.length === 1 ? "plush" : "plushies"} <i aria-hidden="true">→</i></b></span>
						</Link>;
					})}</div>
				</section>

				<section className="collections-animal-section" aria-labelledby="collections-animal-title">
					<div className="collections-section-heading"><div><p className="eyebrow">MEET YOUR MATCH</p><h2 id="collections-animal-title">Shop by animal</h2><p>Bears, bunnies, and all their lovely friends.</p></div></div>
					<div className="collections-animal-grid">{animalCollections.map((collection) => {
						const matching = productsForTag(products, collection.tag);
						return <Link href={`/collections/${collection.slug}`} key={collection.slug} className="collections-animal-card">
							<span className="collections-animal-image"><Image src={matching[0]?.image ?? collection.fallback} alt="" fill sizes="(max-width: 600px) 42vw, 150px" /></span>
							<span className="collections-animal-copy"><strong>{collection.title}</strong><small>{matching.length ? `${matching.length} ${matching.length === 1 ? "plush" : "plushies"}` : "Explore"}</small></span><b aria-hidden="true">→</b>
						</Link>;
					})}</div>
				</section>

				<section className="collections-size-section" id="shop-by-size" aria-labelledby="collections-size-title">
					<div><p className="eyebrow">LITTLE OR LARGER THAN LIFE</p><h2 id="collections-size-title">Shop by size</h2><p>Find just the right fit for your cuddle plans.</p></div>
					<div className="collections-size-grid">{[{name:"Small",range:"Under 25 cm"},{name:"Medium",range:"25–45 cm"},{name:"Large",range:"45–70 cm"},{name:"XL",range:"70 cm +"}].map((size) => <Link href={`/collections/all?size=${size.name}`} key={size.name}><span>{size.name}</span><small>{size.range}</small><b aria-hidden="true">→</b></Link>)}</div>
				</section>

				{featuredProducts.length > 0 && <section className="collections-new-arrivals" aria-labelledby="collections-arrivals-title"><div className="collections-section-heading"><div><p className="eyebrow">JUST LANDED</p><h2 id="collections-arrivals-title">A few new favorites</h2></div><Link href="/collections/new-arrivals">See new arrivals <span aria-hidden="true">→</span></Link></div><ProductGrid products={featuredProducts} compact /></section>}
			</div>
		</SiteFrame>
	);
}
