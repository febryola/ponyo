import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/layout/site-header.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function renderMenu() {
  const ref = { current: null };
  const effects = [];
  const context = {
    exports: {},
    require(id) {
      if (id === "react") return { useRef: () => ref, useEffect: (effect) => effects.push(effect) };
      if (id === "next/link") return { default: "a" };
      if (id === "next/image") return { default: "img" };
      if (id === "next/navigation") return { usePathname: () => "/" };
      if (id === "@/components/layout/localization-provider") return { useLocalization: () => ({ t: (_, fallback) => fallback }) };
      if (id.startsWith("@/")) return {};
      return require(id);
    },
  };
  vm.runInNewContext(`${source}\nexports.TestMenu = DesktopCollectiblesMenu;`, context);
  return { tree: context.exports.TestMenu(), ref, effects };
}

test("desktop Collectibles has no chevron and opens on mouse hover without a click", () => {
  const { tree } = renderMenu();
  assert.equal(tree.type, "details");
  assert.equal(tree.props.children[0].props.children, "Collectibles");
  const menu = { open: false };
  tree.props.onPointerEnter({ currentTarget: menu, pointerType: "touch" });
  assert.equal(menu.open, false);
  tree.props.onPointerEnter({ currentTarget: menu, pointerType: "mouse" });
  assert.equal(menu.open, true);
  tree.props.onPointerLeave({ currentTarget: menu, pointerType: "mouse" });
  assert.equal(menu.open, false);
});

test("keyboard focus stays open within the panel, Escape closes and route changes reset", () => {
  const { tree, ref, effects } = renderMenu();
  let focused = false;
  const menu = { open: false, contains: (target) => target === "child", querySelector: () => ({ focus() { focused = true; } }) };
  ref.current = menu;
  tree.props.onFocusCapture({ currentTarget: menu });
  assert.equal(menu.open, true);
  tree.props.onBlurCapture({ currentTarget: menu, relatedTarget: "child" });
  assert.equal(menu.open, true);
  tree.props.onKeyDown({ key: "Escape", currentTarget: menu, preventDefault() {} });
  assert.equal(menu.open, false);
  assert.equal(focused, true);
  menu.open = true;
  tree.props.onBlurCapture({ currentTarget: menu, relatedTarget: null });
  assert.equal(menu.open, false);
  menu.open = true;
  effects[0]();
  assert.equal(menu.open, false);
});

test("all six category links close the dropdown when selected", () => {
  const { tree, ref } = renderMenu();
  const links = tree.props.children[1].props.children;
  assert.equal(links.length, 6);
  assert.equal(new Set(links.map((link) => link.props.href)).size, 6);
  for (const link of links) {
    ref.current = { open: true };
    link.props.onClick();
    assert.equal(ref.current.open, false);
  }
});