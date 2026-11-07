"use client";

export function SortSelect({ value, category, search }: { value: string; category: string; search: string }) {
  return (
    <form className="sort-select-form" action="/shop" method="get">
      {category && <input type="hidden" name="category" value={category} />}
      {search && <input type="hidden" name="q" value={search} />}
      <label className="sort-filter"><span>Sort by</span><select name="sort_by" defaultValue={value} onChange={(event) => event.currentTarget.form?.requestSubmit()}><option value="featured">Featured</option><option value="relevance">Most relevant</option><option value="best-selling">Best selling</option><option value="title-ascending">Alphabetically, A–Z</option><option value="title-descending">Alphabetically, Z–A</option><option value="price-ascending">Price, low to high</option><option value="price-descending">Price, high to low</option><option value="created-ascending">Date, old to new</option><option value="created-descending">Date, new to old</option></select></label>
    </form>
  );
}
