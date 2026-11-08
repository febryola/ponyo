"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { useLocalization } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";

const animalTabs = [
  { name: "Bears", key: "home.categories.bears", slug: "bears", tags: ["bear"] },
  { name: "Bunnies", key: "home.categories.bunnies", slug: "bunnies", tags: ["bunny"] },
  { name: "Cats", key: "home.categories.cats", slug: "cats", tags: ["cat"] },
  { name: "Puppies", key: "home.categories.puppies", slug: "puppies", tags: ["puppy"] },
  { name: "Pandas", key: "home.categories.pandas", slug: "pandas", tags: ["panda"] },
  { name: "Penguins", key: "home.categories.penguins", slug: "penguins", tags: ["penguin"] },
  { name: "Cute Characters", key: "home.categories.characters", slug: "characters", tags: ["character"] },
];

function matchesAnimal(product: Product, tags: string[]) {
  const productTags = product.tags ?? [];
  const details = `${product.categoryName} ${product.productType ?? ""} ${product.name}`
    .toLowerCase()
    .replace(/ies\b/g, "y")
    .replace(/s\b/g, "");
  return tags.some((tag) => productTags.includes(tag) || details.includes(tag));
}

export function AnimalTabs({ products }: { products: Product[] }) {
  const { t } = useLocalization();
  const availableTabs = animalTabs;
  const [active, setActive] = useState(availableTabs[0]?.slug ?? "");
  const current = availableTabs.find((tab) => tab.slug === active) ?? availableTabs[0];
  if (!current) return null;
  const matching = products.filter((product) => matchesAnimal(product, current.tags)).slice(0, 6);

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
      <div className="animal-tabs-heading"><h2 id="animals-heading">{t("home.aisles.animal_title", "Shop by animal")}</h2><p>{t("home.aisles.animal_sub", "Bears, bunnies, cats and more. Pick a favourite and meet the family.")}</p></div>
      <div className="animal-tabs-list" role="tablist" aria-label="Shop by animal">
        {availableTabs.map((tab, index) => {
          const item = products.find((product) => matchesAnimal(product, tab.tags));
          return <button key={tab.slug} id={`animal-tab-${tab.slug}`} type="button" role="tab" aria-selected={active === tab.slug} aria-controls={`animal-panel-${tab.slug}`} tabIndex={active === tab.slug ? 0 : -1} onClick={() => setActive(tab.slug)} onKeyDown={(event) => onKeyDown(event, index)}>{item && <span className="animal-tab-image"><Image src={item.image} alt="" width={32} height={32} /></span>}{t(tab.key, tab.name)}</button>;
        })}
      </div>
      <div role="tabpanel" id={`animal-panel-${current.slug}`} aria-labelledby={`animal-tab-${current.slug}`}>
        <ProductGrid products={matching} badges={Object.fromEntries(matching.flatMap((product) => product.tags?.includes("rare") ? [[product.slug, "Rare"]] : []))} fillSlots fillColumns={[4, 3, 4, 6]} promoCount={2} />
        <Link className="animal-tabs-all" href={`/collections/${current.slug}`}>Shop all {current.name} →</Link>
      </div>
    </section>
  );
}
