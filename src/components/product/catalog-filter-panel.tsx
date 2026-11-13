import Link from "next/link";

type CatalogFilterPanelProps = {
  categories: Array<{ title: string; slug: string }>;
  category: string;
  size: string;
  minimum: number;
  maximum: number;
  availability: string;
  preservedQuery: Record<string, string>;
  clearHref: string;
};

export function CatalogFilterPanel({ categories, category, size, minimum, maximum, availability, preservedQuery, clearHref }: CatalogFilterPanelProps) {
  return (
    <details className="all-filters">
      <summary>
        <span className="filter-summary-label"><span aria-hidden="true">☷</span> Filters</span>
        <svg className="catalog-chevron filter-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="all-filters-panel">
        <form action="/shop" method="get" className="catalog-filter-form">
          {Object.entries(preservedQuery).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <h2>Refine your finds</h2>
          <label>Category
            <select name="category" defaultValue={category}>
              <option value="">All plush</option>
              {categories.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
            </select>
          </label>
          <label>Size
            <select name="size" defaultValue={size}>
              <option value="">Any size</option>
              {["Small", "Medium", "Large", "XL"].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Price range</legend>
            <div className="catalog-price-fields">
              <label>From ¥<input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder="0" /></label>
              <label>To ¥<input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder="No limit" /></label>
            </div>
          </fieldset>
          <label className="catalog-stock-filter"><input type="checkbox" name="filter.v.availability" value="1" defaultChecked={availability === "1"} /> In stock only</label>
          <div className="catalog-filter-actions"><button type="submit">Show results <span aria-hidden="true">→</span></button><Link href={clearHref}>Clear filters</Link></div>
        </form>
      </div>
    </details>
  );
}
