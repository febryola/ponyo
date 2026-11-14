import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Domina has a dedicated image container and a separate results row", () => {
	const page = read("../src/app/pages/[slug]/page.tsx");
	assert.match(page, /className="domina-hero-media"><Image[^>]*fill/);
	assert.match(
		page,
		/className="domina-catalog-results">\s*<span[^>]*role="status"/,
	);
	assert.match(page, /className="domina-size-filter"/);
	assert.match(page, /aria-label="Filter XL plush"/);
	assert.equal((page.match(/inputMode="numeric"/g) || []).length, 2);
	assert.match(page, /<input type="hidden" name="sort_by" value=\{sort\}/);
	assert.match(
		page,
		/preservedFilters=\{preservedFilters\} options=\{dominaSortOptions\}/,
	);
});

test("Domina mobile controls have shrinkable tracks and a stacked catalog heading", () => {
	const css = read("../src/app/domina-responsive.css");
	const mobile = css.split("@media (max-width: 767px)")[1];
	assert.ok(
		read("../src/app/layout.tsx").includes('import "./domina-responsive.css"'),
	);
	assert.match(
		mobile,
		/\.domina-products-heading\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\);/,
	);
	assert.match(
		mobile,
		/\.domina-catalog-filters\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
	);
	assert.match(mobile, /\.domina-size-filter\s*\{\s*grid-column: 1 \/ -1;/);
	assert.match(
		mobile,
		/\.domina-catalog-results\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
	);
	assert.match(
		css,
		/\.domina-catalog-toolbar \.sort-filter\s*\{[^}]*display: grid;[^}]*grid-template-columns: auto minmax\(0, 1fr\);/,
	);
	assert.match(
		css,
		/input\[type="number"\]\s*\{[^}]*min-width: 0;[^}]*font-size: 16px;/,
	);
	assert.match(
		css,
		/\.sort-menu:not\(\[open\]\)\s*>\s*\.sort-menu-options\s*\{\s*display: none;/,
	);
	assert.match(
		mobile,
		/\.domina-hero-media\s*\{[^}]*position: relative;[^}]*grid-row: 1;/,
	);
	assert.match(mobile, /\.domina-page-hero-copy\s*\{[^}]*grid-row: 2;/);
});

test("sorting supports repeated trigger, outside pointer, focus dismissal and Escape", () => {
	const source = read("../src/components/product/sort-select.tsx");
	assert.ok(source.startsWith('"use client";'));
	assert.match(source, /menu\.open = !menu\.open/);
	assert.match(source, /event\.preventDefault\(\)/);
	for (const event of ["pointerdown", "focusin"]) {
		assert.ok(
			source.includes(`document.addEventListener("${event}", dismissOutside)`),
		);
		assert.ok(
			source.includes(
				`document.removeEventListener("${event}", dismissOutside)`,
			),
		);
	}
	assert.match(source, /!menu\.contains\(event\.target\)/);
	assert.match(source, /event\.key === "Escape"/);
	assert.match(source, /focus\(\{ preventScroll: true \}\)/);
	assert.match(
		source,
		/onSubmit=\{\(\) => \{\s*if \(menuRef.current\) menuRef.current.open = false/,
	);
	assert.match(source, /type="submit" name="sort_by" value=\{option.value\}/);
	assert.match(
		read("../src/app/collection-theme.css"),
		/\.sort-menu:not\(\[open\]\)\s*>\s*\.sort-menu-options\s*\{\s*display: none;/,
	);
});

test("Domina has animated metallic jellyfish and soft gold cloud styling", () => {
	const source = read("../src/app/pages/[slug]/page.tsx");
	const css = read("../src/app/domina-responsive.css");
	assert.match(source, /id="domina-catalog-gold" tone="gold"/);
	assert.match(source, /id="domina-catalog-silver" tone="silver"/);
	assert.match(source, /id="domina-hero-silver" tone="silver"/);
	assert.match(css, /@keyframes domina-jellyfish-swim/);
	assert.match(
		css,
		/\.domina-jellyfish\s*\{[^}]*pointer-events: none;[^}]*animation: domina-jellyfish-swim/,
	);
	assert.match(
		css,
		/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.domina-page \.domina-jellyfish\s*\{\s*animation: none;/,
	);
	assert.match(css, /border-radius: 55px 80px 48px 64px/);
});
