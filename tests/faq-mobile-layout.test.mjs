import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(
	new URL("../src/app/theme-parity-polish.css", import.meta.url),
	"utf8",
);

test("mobile FAQ navigation can wrap within a full-width header", () => {
	assert.match(
		css,
		/\.faq-page-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
	);
	assert.match(css, /\.faq-page-header nav a\s*\{[^}]*white-space:\s*normal;/s);
	assert.match(
		css,
		/\.faq-page-header nav a:last-child\s*\{[^}]*justify-self:\s*stretch;/s,
	);
});

test("mobile FAQ headings reserve a second row for the answer count", () => {
	assert.match(
		css,
		/\.faq-topic>div\.faq-topic-heading:first-of-type\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*42px minmax\(0,\s*1fr\);/s,
	);
	assert.match(
		css,
		/\.faq-topic-heading \.faq-question-count\s*\{[^}]*grid-row:\s*2;/s,
	);
});

test("mobile shipping timeline uses compact vertical connectors without rotation", () => {
	assert.match(
		css,
		/\.shipping-journey-connector\s*\{[^}]*transform:\s*none;[^}]*font-size:\s*0;/s,
	);
	assert.match(css, /\.shipping-journey-connector::after\s*\{/);
	assert.doesNotMatch(
		css,
		/\.shipping-journey-connector\s*\{[^}]*transform:\s*rotate\(90deg\)/s,
	);
});

test("open FAQ rows rotate only the toggle and keep mobile question text readable", () => {
	assert.match(
		css,
		/\.faq-topic details\[open\] summary \.faq-toggle\s*\{[^}]*transform:\s*rotate\(45deg\);/s,
	);
	assert.doesNotMatch(
		css,
		/\.faq-topic details\[open\] summary span\s*\{[^}]*transform:\s*rotate\(45deg\);/s,
	);
	assert.match(css, /\.faq-topic summary\s*\{[^}]*font-size:\s*14px;/s);
	assert.match(
		css,
		/\.shipping-journey article strong\s*\{[^}]*font-size:\s*13px;/s,
	);
	assert.match(
		css,
		/\.shipping-journey article small\s*\{[^}]*font-size:\s*12px;/s,
	);
});
