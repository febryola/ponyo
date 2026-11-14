import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function load(path, mocks = {}) {
	const source = ts.transpileModule(read(path), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.ReactJSX,
		},
	}).outputText;
	const context = {
		exports: {},
		require: (id) => (id in mocks ? mocks[id] : require(id)),
	};
	vm.runInNewContext(source, context);
	return context.exports;
}

const { selectRelatedProducts } = load("../src/lib/related-products.ts");
const product = { id: "current", categoryName: "Bears", tags: ["premium"] };
const item = (id, categoryName = "Cats", tags = []) => ({
	id,
	categoryName,
	tags,
});

test("recommendations prefer related products and fill six distinct slots without the current product", () => {
	const products = [
		product,
		item("other-1"),
		item("bear", "Bears"),
		item("premium", "Cats", ["premium"]),
		item("other-2"),
		item("other-3"),
		item("other-4"),
		item("other-5"),
		item("bear", "Bears"),
	];
	assert.deepEqual(
		Array.from(selectRelatedProducts(products, product), ({ id }) => id),
		["bear", "premium", "other-1", "other-2", "other-3", "other-4"],
	);
	assert.equal(selectRelatedProducts([product], product).length, 0);
	assert.equal(
		selectRelatedProducts([product, item("only")], product).length,
		1,
	);
	assert.equal(selectRelatedProducts(products.slice(1), product).length, 6);
});

test("the detail page passes six-item selection to its recommendations grid using the full catalog request", () => {
	const page = read("../src/app/products/[id]/page.tsx");
	assert.match(page, /getLocalizedProducts\("\?limit=100"\)/);
	assert.match(
		page,
		/const related = selectRelatedProducts\(products, product\)/,
	);
	assert.match(
		page,
		/className="related-products store-container"[\s\S]*<ProductGrid products=\{related\}/,
	);
});

const { ProductCard } = load("../src/components/product/product-card.tsx", {
	"next/image": { default: "img" },
	"next/link": { default: "a" },
	"@/lib/wishlist": { saveWishlist() {}, useWishlistHandles: () => [] },
	"@/components/product/product-card-action": {
		ProductCardAction: "ProductCardAction",
	},
	"@/components/layout/localization-provider": {
		useLocalization: () => ({
			formatPrice: (amount) => `IDR\u00a0${amount.toLocaleString("de-DE")}`,
			t: (_, fallback) => fallback,
		}),
	},
});

test("normal and sale cards give long currency values independent wrapping elements", () => {
	for (const compareAtAmount of [undefined, 123456789]) {
		const tree = ProductCard({
			product: {
				...product,
				slug: "bear",
				name: "Long translated product name",
				priceAmount: 98765432,
				compareAtAmount,
				currency: "IDR",
				availability: "available",
				tags: ["premium", "new-arrival"],
			},
		});
		const card = tree.props.children[0];
		const image = card.props.children[1];
		assert.ok(image.props.children[1].props.children.length >= 3);
		assert.equal(image.props.children[2].props.className, "wishlist-toggle");
		const bottom = card.props.children[2].props.children[3];
		const prices = bottom.props.children[0];
		assert.equal(prices.props.className, "shop-product-prices");
		assert.equal(
			prices.props.children[0].props.className,
			"shop-product-current-price",
		);
		assert.equal(
			prices.props.children[0].props.children,
			"IDR\u00a098.765.432",
		);
		const salePrice =
			prices.props.children.length > 1 && prices.props.children[1]
				? prices.props.children[1].type
				: null;
		assert.equal(salePrice, compareAtAmount ? "del" : null);
	}
});

test("product cards place a large action below the image and above product details", () => {
	const page = read("../src/app/page.tsx");
	const tree = ProductCard({
		product: {
			...product,
			slug: "bear",
			name: "Bear",
			priceAmount: 1200,
			currency: "JPY",
			availability: "available",
		},
	});
	const card = tree.props.children[0];
	const cardLink = card.props.children[0];
	const image = card.props.children[1];
	const info = card.props.children[2];
	const action = tree.props.children[1];
	assert.equal(action.type, "ProductCardAction");
	assert.equal(action.props.product.id, "current");
	assert.equal(action.props.productName, "Bear");
	assert.equal(info.props.children.length, 5);
	assert.equal(image.props.children.length, 3);
	assert.equal(cardLink.type, "a");
	assert.equal(cardLink.props.className, "shop-product-card-link");
	assert.equal(cardLink.props.href, "/products/current");
	assert.ok(cardLink.props["aria-label"]);
	assert.equal(image.props.children[0].type, "img");
	assert.equal(info.props.children[0].type, "span");
	const storefrontCss = read("../src/app/storefront.css");
	assert.match(
		storefrontCss,
		/\.shop-product-card-link\s*\{[^}]*position: absolute;[^}]*z-index: 1;[^}]*inset: 0;/,
	);
	assert.match(
		storefrontCss,
		/\.shop-product-info\s*\{[^}]*pointer-events: none;/,
	);
	assert.match(storefrontCss, /\.wishlist-toggle\s*\{[^}]*z-index: 2;/);
	assert.equal(tree.props.className, "product-card-item");
	assert.ok(
		!info.props.children.some(
			(child) => child && child.type === "ProductCardAction",
		),
	);
	const actionSource = read(
		"../src/components/product/product-card-action.tsx",
	);
	assert.doesNotMatch(
		actionSource,
		/product-card-action-price|product-card-action-arrow/,
	);
	assert.match(actionSource, /ProductActionIcon type="bag"/);
	assert.match(actionSource, /ProductActionIcon type="email"/);
	assert.match(
		read("../src/components/home/jellyfish-artwork.tsx"),
		/<linearGradient id=\{`\$\{id\}-bell`\}/,
	);
	assert.match(actionSource, /<rect x="3\.5" y="5\.5" width="17" height="13"/);
	assert.match(actionSource, /strokeWidth="1\.7" strokeLinejoin="round"/);
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(
		css,
		/body:has\(\.product-page\) \.store-footer \.footer-inner,\s*\.product-page~\.store-footer \.footer-inner,\s*\.store-main\.product-page~\.store-footer \.footer-inner\s*\{\s*padding-bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\);/,
	);
	const actionCss = read("../src/app/product-card-actions.css");
	assert.match(
		actionCss,
		/\.product-card-item\s*\{[^}]*display: flex;[^}]*flex-direction: column;/,
	);
	assert.match(
		actionCss,
		/\.product-card-item\s*>\s*\.product-card-action-wrap\s+\.product-card-action\s*\{[^}]*min-height: 52px;[^}]*padding: 8px 4px;[^}]*justify-content: center;[^}]*font-size: clamp\(16px, 1\.15vw, 19px\);[^}]*text-align: center;[^}]*text-transform: none;/,
	);
	assert.match(
		actionCss,
		/\.product-card-action-icon\s*\{[^}]*width: 27px;[^}]*height: 27px;[^}]*position: relative;/,
	);
	assert.match(
		actionCss,
		/linear-gradient\(135deg, #fffefa, #f8edda 48%, #fffaf0\)/,
	);
	assert.match(
		actionCss,
		/\.product-card-action::before\s*\{[^}]*inset: 4px;[^}]*border: 1px solid rgb\(190 151 78 \/ 38%\)/,
	);
	assert.match(
		actionCss,
		/\.product-card-action-icon\.is-email\s*\{[^}]*color: #93662e;/,
	);
	assert.match(
		css,
		/\.shop-product-image img[\s\S]*transform: scale\(1\.075\) translateY\(-3px\)/,
	);
	assert.match(
		css,
		/\.home-live-shelf \.section-title[\s\S]*background: none;[\s\S]*box-shadow: none;/,
	);
	const spotlightCss = read("../src/app/home-size-spotlight.css");
	assert.match(
		spotlightCss,
		/size-guide-tile--xl::before[\s\S]*xl-spotlight-breathe/,
	);
	assert.match(
		spotlightCss,
		/size-guide-tile--xl:hover img[\s\S]*scale\(1\.055\)/,
	);
	assert.match(
		spotlightCss,
		/\.size-guide h2[\s\S]*font-size: clamp\(42px, 5vw, 64px\)/,
	);
	assert.match(
		spotlightCss,
		/\.size-guide-light[\s\S]*radial-gradient\(ellipse 34% 86% at 82% 48%/,
	);
	assert.match(spotlightCss, /@keyframes size-guide-hero-drift-a/);
	assert.equal(
		(
			read("../src/app/page.tsx").match(
				/className: "size-guide-hero-jellyfish--/g,
			) || []
		).length,
		8,
	);
	assert.match(
		spotlightCss,
		/\.domina-quote-marquee\s*\{[^}]*height: 74px;[^}]*font-size: clamp\(17px, 1\.65vw, 23px\)/,
	);
	assert.match(page, /tone: "silver"/);
	assert.match(page, /tone: "gold"/);
	assert.match(
		page,
		/tone=\{jellyfish\.tone\} direction=\{jellyfish\.direction\}/,
	);
	assert.match(spotlightCss, /aspect-ratio: 420 \/ 260/);
	assert.match(spotlightCss, /background: linear-gradient\(90deg, #edc96d/);
	assert.match(spotlightCss, /@keyframes size-guide-hero-drift-c/);
	assert.match(
		spotlightCss,
		/size-guide-tile--xl strong[\s\S]*font-size: 16px/,
	);
});

test("product waitlist shows the lantern-lit waiting-list character panorama", () => {
	const community = read("../src/components/product/product-community.tsx");
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(
		community,
		/className="product-waitlist-lineup" aria-hidden="true"/,
	);
	assert.match(
		community,
		/className="product-waitlist-layout">\s*<section className="product-waitlist"[\s\S]*?<\/section>\s*<div className="product-waitlist-side-art"[\s\S]*className="product-waitlist-side-copy"[\s\S]*A little magic/,
	);
	assert.match(
		community,
		/className="product-waitlist-side-constellation" viewBox="0 0 600 180"[\s\S]*product-waitlist-starfall/,
	);
	assert.doesNotMatch(community, /product-waitlist-side-arrow/);
	assert.match(
		community,
		/src="\/images\/waiting-list-transparent\.png" alt="" fill loading="eager" unoptimized/,
	);
	assert.match(
		css,
		/\.product-waitlist-lineup\s*\{[^}]*aspect-ratio: 1010 \/ 287;[^}]*background: radial-gradient\(ellipse at 50% 70%, #f9d98438/,
	);
	assert.match(
		css,
		/\.product-waitlist-side-art\s*\{[^}]*width: min\(50vw, 680px\);[^}]*right: calc\(100% \+ clamp\(46px, 5vw, 78px\)\)/,
	);
	assert.match(
		css,
		/\.product-waitlist-starfall\s*\{[^}]*animation: waitlist-starfall/,
	);
	assert.match(
		css,
		/\.product-waitlist-side-copy\s*\{[^}]*text-align: center;/,
	);
	assert.doesNotMatch(
		css,
		/waitlist-constellation-drift|product-waitlist-side-arrow/,
	);
	assert.match(
		css,
		/@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{\s*\.product-waitlist-lineup\s*\{\s*display: block;/,
	);
	const mobileWaitlistCss = css.slice(
		css.indexOf(
			"@media (max-width: 767px)",
			css.indexOf("@keyframes waitlist-sparkle"),
		),
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*width: 100vw;[^}]*height: clamp\(116px, 34vw, 138px\)/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*border-top: 0;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup img\s*\{[^}]*object-fit: contain;[^}]*object-position: center bottom;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*border-top: 0;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-side-art\s*\{\s*display: none;/,
	);
	assert.match(
		css,
		/\.product-waitlist-lineup-glow\s*\{[^}]*filter: blur\(18px\);[^}]*animation: waitlist-lantern-glow/,
	);
	assert.match(css, /@keyframes waitlist-friends-float/);
	assert.match(
		css,
		/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.product-waitlist-lineup img,[^}]*animation: none;/,
	);
	assert.ok(read("../public/images/waiting-list-transparent.png"));
});

test("home exposes only Coming Soon catalog products in its dedicated notify shelf", () => {
	const page = read("../src/app/page.tsx");
	const action = read("../src/components/product/product-card-action.tsx");
	assert.match(
		page,
		/products\.filter\(\(product\) => product\.availabilityStatus === "Coming Soon"\)/,
	);
	assert.match(
		page,
		/comingSoon\.length > 0 && <ProductShelf[\s\S]*id="coming-soon"/,
	);
	assert.match(
		action,
		/ponyoApi\.joinProductWaitlist\(product\.id, \{ email: emailAddress\.trim\(\), firstName \}\)/,
	);
	assert.match(
		action,
		/if \(customer\) \{\s*void notify\(customer\.email, customer\.firstName\)/,
	);
	assert.match(action, /setDialogOpen\(true\)/);
});

test("size guide keeps large jellyfish and Domina quote outside the size tiles", () => {
	const page = read("../src/app/page.tsx");
	const headerJellyfish = page.indexOf("{sizeGuideJellyfish.map");
	const tiles = page.indexOf('<div className="size-guide-tiles">');
	assert.ok(headerJellyfish >= 0 && tiles > headerJellyfish);
	assert.ok(page.includes('className="domina-quote-marquee"'));
	assert.ok(page.includes('className="size-guide-light"'));
});

test("homepage intro uses one large plush lineup and places it after the actions on mobile", () => {
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(css, /\.home-marketplace-intro\s*\{[^}]*background: #fff/);
	assert.match(
		css,
		/\.home-marketplace-intro::before\s*\{[^}]*z-index: -1;[^}]*width: 100vw/,
	);
	assert.match(css, /background: url\("\/images\/plushies-home-3\.png"\)/);
	assert.match(css, /opacity: \.62/);
	assert.equal(
		(css.match(/url\("\/images\/plushies-home-3\.png"\)/g) || []).length,
		1,
	);
	assert.match(css, /\.home-marketplace-intro::after\s*\{\s*content: none;/);
	const mobile = css.slice(
		css.indexOf("/* Desktop homepage: keep size cards orderly"),
	);
	assert.match(
		mobile,
		/@media \(max-width: 767px\)[\s\S]*\.home-marketplace-intro::before\s*\{[^}]*position: relative;[^}]*order: 1;[^}]*aspect-ratio: 1024 \/ 216;[^}]*background-size: contain;[^}]*transform: none;/,
	);
	assert.match(
		css,
		/\.home-marketplace-intro>\*\s*\{[^}]*position: relative;[^}]*z-index: 1/,
	);
});

test("mobile size guide has an edge-to-edge ticker and decorative jellyfish above the portraits", () => {
	const css = read("../src/app/home-size-spotlight.css");
	const page = read("../src/app/page.tsx");
	const mobile = css.split("@media (max-width: 767px)")[1];
	assert.match(
		mobile,
		/\.domina-quote-marquee\s*\{[^}]*width: 100vw;[^}]*margin: 0 calc\(50% - 50vw\) 12px;[^}]*mask-image: none;/,
	);
	assert.match(css, /\.size-guide-mobile-jellyfish\s*\{\s*display: none;/);
	assert.match(
		mobile,
		/\.size-guide-mobile-jellyfish\s*\{[^}]*position: absolute;[^}]*display: block;[^}]*pointer-events: none;/,
	);
	assert.match(
		page,
		/className="size-guide-tiles">[\s\S]*className="size-guide-mobile-jellyfish" aria-hidden="true">[\s\S]*sizeGuideJellyfish\.slice\(0, 3\)/,
	);
	assert.match(page, /id=\{`size-guide-mobile-\$\{jellyfish\.tone\}`\}/);
});

test("footer has a themed image banner, animation, and social links", () => {
	const footer = read("../src/components/layout/site-footer.tsx");
	const css = read("../src/app/footer-experience.css");
	assert.ok(footer.includes("/images/footer-plush-lineup.png"));
	assert.ok(footer.includes('className="footer-plush-lineup"'));
	assert.ok(!footer.includes('className="footer-visual"'));
	assert.ok(footer.includes('name: "Instagram"'));
	assert.ok(footer.includes('name: "TikTok"'));
	assert.ok(footer.includes('name: "YouTube"'));
	assert.ok(footer.includes('className="footer-social"'));
	assert.match(
		css,
		/\.footer-plush-lineup[\s\S]*object-fit: cover;[\s\S]*object-position: center bottom;/,
	);
	assert.match(css, /\.footer-social-links/);
	assert.match(
		footer,
		/className="footer-plush-lineup"[\s\S]*className="footer-social"/,
	);
});

test("overflow rules reserve wishlist space and six columns are scoped to detail recommendations", () => {
	const css = read("../src/app/theme-parity-polish.css").split(
		"/* Scoped product-card overflow fixes and product-detail recommendations only. */",
	)[1];
	assert.ok(css, "scoped append-only CSS section exists");
	assert.match(
		css,
		/\.shop-product-card \.product-labels\s*\{[^}]*right: 56px;[^}]*flex-wrap: wrap;/,
	);
	assert.match(
		css,
		/\.product-labels \.product-label\s*\{[^}]*font-size: 9px;[^}]*overflow-wrap: anywhere;/,
	);
	assert.match(
		css,
		/\.shop-product-bottom \.shop-product-prices\s*\{[^}]*flex-wrap: wrap;[^}]*font-size: clamp\(15px, 10cqi, 22px\);/,
	);
	assert.match(
		css,
		/@media \(min-width: 1200px\)\s*\{\s*\.product-page \.related-products\s*>\s*\.product-grid\s*\{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/,
	);
	assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
});

test("desktop size guide scales square portraits rather than clipping shallow heads", () => {
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(
		css,
		/a\.size-guide-tile>span\s*\{[^}]*width: min\(100%, var\(--size-portrait\)\);[^}]*height: auto;[^}]*aspect-ratio: 1;[^}]*border-radius: 50% 50% 12px 12px;/,
	);
	assert.match(
		css,
		/a\.size-guide-tile img\s*\{[^}]*object-fit: cover;[^}]*object-position: center;[^}]*transform: none;/,
	);
	const page = read("../src/app/page.tsx");
	assert.ok(
		page.includes("translationKey={`home.size.${tile.name.toLowerCase()}`}"),
	);
	assert.ok(page.includes("translationKey={`home.size.${tile.rangeKey}`}"));
});
