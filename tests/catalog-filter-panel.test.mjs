import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("closed catalog filters explicitly remove the panel from layout", () => {
	const css = read("../src/app/collection-theme.css");
	assert.match(
		css,
		/\.all-filters:not\(\[open\]\)\s*>\s*\.all-filters-panel\s*\{\s*display: none;/,
	);
	assert.match(
		css,
		/\.all-filters\[open\]\s*>\s*\.all-filters-panel\s*\{\s*display: block;/,
	);
	assert.match(css, /max-height: min\(78dvh, 640px\)/);
	const fields = css.indexOf(
		"font: 700 13px var(--font-nunito), sans-serif;",
		css.indexOf(".collection-page .catalog-filter-form select"),
	);
	const touch = css.search(
		/@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)/,
	);
	assert.ok(touch > fields, "touch font rule follows the base input font");
	assert.match(
		css.slice(touch),
		/input\[type="number"\]\s*\{\s*font-size: 16px;/,
	);
});

test("catalog filters dismiss outside and with Escape without navigation", () => {
	const source = read("../src/components/product/catalog-filter-panel.tsx");
	assert.ok(source.startsWith('"use client";'));
	assert.match(
		source,
		/document\.addEventListener\("pointerdown", dismissOutside\)/,
	);
	assert.match(
		source,
		/document\.removeEventListener\("pointerdown", dismissOutside\)/,
	);
	assert.match(source, /!details\.contains\(event\.target\)/);
	assert.match(source, /activeElement\.blur\(\)/);
	assert.match(source, /event\.key === "Escape"/);
	assert.match(source, /focus\(\{ preventScroll: true \}\)/);
	assert.match(source, /<form action="\/shop" method="get"/);
});

test("homepage campaigns have one silver jumbo and one gold decorative jellyfish", () => {
	const source = read("../src/app/page.tsx");
	const css = read("../src/app/home-size-spotlight.css");
	assert.equal((source.match(/id="rare-jumbo-silver"/g) || []).length, 1);
	assert.equal((source.match(/id="coming-soon-gold"/g) || []).length, 1);
	assert.match(source, /home-campaign-jellyfish--silver" aria-hidden="true"/);
	assert.match(
		source,
		/decoration=\{<span className="home-campaign-jellyfish home-campaign-jellyfish--gold"/,
	);
	assert.match(css, /\.home-campaign-jellyfish\s*\{[^}]*pointer-events: none;/);
	const shelf = read("../src/components/product/product-shelf.tsx");
	assert.match(
		shelf,
		/<Link className="view-all"[^\n]*\n\s*\{decoration\}\s*<\/div>\s*<ProductGrid/,
	);
	assert.ok(
		!css.includes("is-single-product"),
		"gold decoration is not positioned next to the product grid",
	);
	assert.match(
		css,
		/\.coming-soon-shelf \.section-head\s*\{[^}]*padding-right: 36%;[^}]*padding-bottom: 0;/,
	);
	assert.match(
		css,
		/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.home-campaign-jellyfish,/,
	);
});
