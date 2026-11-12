import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const data = { exports: {} };
vm.runInNewContext(compile("../src/app/blogs/journal-articles.ts"), data);
const { journalArticles, getJournalArticle } = data.exports;

test("journal matches the Shopify article order, dates and complete section counts", () => {
  assert.deepEqual(Array.from(journalArticles, (article) => article.slug), [
    "love-it-longer-simple-ways-to-care-for-your-plush",
    "look-closer-the-little-details-that-make-a-plush-special",
    "go-big-or-go-home-how-to-choose-an-xl-plush-for-your-space",
  ]);
  assert.deepEqual(Array.from(journalArticles, (article) => article.sections.length), [8, 7, 6]);
  for (const article of journalArticles) {
    assert.equal(article.date, "2026-11-05");
    assert.equal(article.author, "Ponyo");
    assert.equal(article.introduction.length, 2);
    assert.ok(existsSync(new URL(`../public${article.image}`, import.meta.url)));
    assert.equal(getJournalArticle(article.slug), article);
    for (const slug of article.previousSlugs) assert.equal(getJournalArticle(slug), article);
  }
  assert.equal(getJournalArticle("not-an-article"), undefined);
});

const revealSource = compile("../src/components/journal/journal-reveal.tsx");
function revealHarness({ reduced = false, supported = true } = {}) {
  const targets = Array.from({ length: 3 }, () => {
    const classes = new Set();
    return { classList: { add: (value) => classes.add(value), contains: (value) => classes.has(value) } };
  });
  const events = new Map();
  const root = { dataset: {}, querySelectorAll: () => targets, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: (key) => events.delete(key) };
  const motionEvents = new Map();
  const motion = { matches: reduced, addEventListener: (key, fn) => motionEvents.set(key, fn), removeEventListener: (key) => motionEvents.delete(key) };
  const observers = [];
  class Observer {
    observed = new Set();
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.observed.clear(); }
  }
  class Element {
    constructor(target) { this.target = target; }
    closest() { return this.target; }
  }
  let effect;
  const context = {
    exports: {}, HTMLElement: Element, IntersectionObserver: Observer,
    window: { matchMedia: () => motion, ...(supported ? { IntersectionObserver: Observer } : {}) },
    require(id) {
      if (id === "react") return { useRef: () => ({ current: root }), useEffect: (fn) => { effect = fn; } };
      return require(id);
    },
  };
  vm.runInNewContext(revealSource, context);
  context.exports.JournalReveal({ children: "Server-rendered story" });
  assert.equal(root.dataset.journalMotion, undefined);
  const cleanup = effect();
  return { root, targets, observers, motion, motionEvents, events, Element, cleanup };
}

test("scroll reveal observes each element and reveals only intersecting entries once", () => {
  const { root, targets, observers, cleanup, events, motionEvents } = revealHarness();
  const observer = observers[0];
  assert.equal(root.dataset.journalMotion, "ready");
  assert.equal(observer.options.rootMargin, "0px 0px -15% 0px");
  assert.equal(observer.options.threshold, 0.15);
  assert.equal(observer.observed.size, 3);
  observer.callback([{ target: targets[0], isIntersecting: true }, { target: targets[1], isIntersecting: false }]);
  assert.ok(targets[0].classList.contains("is-journal-visible"));
  assert.ok(!targets[1].classList.contains("is-journal-visible"));
  assert.ok(!observer.observed.has(targets[0]));
  cleanup();
  assert.equal(observer.observed.size, 0);
  assert.equal(root.dataset.journalMotion, undefined);
  assert.equal(events.size, 0);
  assert.equal(motionEvents.size, 0);
});

test("reduced motion and unsupported browsers keep all content visible", () => {
  for (const options of [{ reduced: true }, { supported: false }]) {
    const result = revealHarness(options);
    assert.equal(result.root.dataset.journalMotion, undefined);
    assert.equal(result.observers.length, 0);
    result.cleanup?.();
  }
});

test("changing motion preferences disables hiding and keyboard focus reveals its target", () => {
  const result = revealHarness();
  result.events.get("focusin")({ target: new result.Element(result.targets[2]) });
  assert.ok(result.targets[2].classList.contains("is-journal-visible"));
  result.motion.matches = true;
  result.motionEvents.get("change")();
  assert.equal(result.root.dataset.journalMotion, undefined);
  assert.equal(result.observers[0].observed.size, 0);
  result.cleanup();
});