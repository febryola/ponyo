"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import type { Product } from "@/types/product";

const animalTabs = [
  { name: "Bears", slug: "bears", tags: ["bear"] },
  { name: "Bunnies", slug: "bunnies", tags: ["bunny"] },
  { name: "Cats", slug: "cats", tags: ["cat"] },
  { name: "Puppies", slug: "puppies", tags: ["puppy"] },
  { name: "Pandas", slug: "pandas", tags: ["panda"] },
  { name: "Penguins", slug: "penguins", tags: ["penguin"] },
  { name: "Cute Characters", slug: "characters", tags: ["character"] },
];

export function AnimalTabs({ products }: { products: Product[] }) {
  const availableTabs = animalTabs.filter((tab) => products.some((product) => tab.tags.some((tag) => product.tags?.includes(tag))));
  const [active, setActive] = useState(availableTabs[0]?.slug ?? "");
  const current = availableTabs.find((tab) => tab.slug === active) ?? availableTabs[0];
  if (!current) return null;
  const matching = products.filter((product) => current.tags.some((tag) => product.tags?.includes(tag))).slice(0, 6);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + offset + availableTabs.length) % availableTabs.length;
    setActive(availableTabs[next].slug);
    document.getElementById(`animal-tab-${availableTabs[next].slug}`)?.focus();
  }

  return (
    <section className="animal-tabs-section store-container" aria-labelledby="animals-heading">
      <div className="animal-tabs-heading"><h2 id="animals-heading">Bears, bunnies, cats and more</h2><p>Pick a favourite and meet the family.</p></div>
      <div className="animal-tabs-list" role="tablist" aria-label="Shop by animal">
        {availableTabs.map((tab, index) => {
          const item = products.find((product) => tab.tags.some((tag) => product.tags?.includes(tag)));
          return <button key={tab.slug} id={`animal-tab-${tab.slug}`} type="button" role="tab" aria-selected={active === tab.slug} aria-controls={`animal-panel-${tab.slug}`} tabIndex={active === tab.slug ? 0 : -1} onClick={() => setActive(tab.slug)} onKeyDown={(event) => onKeyDown(event, index)}>{item && <span className="animal-tab-image"><Image src={item.image} alt="" width={32} height={32} /></span>}{tab.name}</button>;
        })}
      </div>
      <div role="tabpanel" id={`animal-panel-${current.slug}`} aria-labelledby={`animal-tab-${current.slug}`}>
        <ProductGrid products={matching} badges={Object.fromEntries(matching.flatMap((product) => product.tags?.includes("rare") ? [[product.slug, "Rare"]] : []))} />
        <Link className="animal-tabs-all" href={`/collections/${current.slug}`}>Shop all {current.name} →</Link>
      </div>
    </section>
  );
}
