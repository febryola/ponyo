type SortOption = { value: string; label: string };

const sortOptions: SortOption[] = [
  { value: "featured", label: "Featured" },
  { value: "relevance", label: "Most relevant" },
  { value: "best-selling", label: "Best selling" },
  { value: "title-ascending", label: "Alphabetically, A–Z" },
  { value: "title-descending", label: "Alphabetically, Z–A" },
  { value: "price-ascending", label: "Price, low to high" },
  { value: "price-descending", label: "Price, high to low" },
  { value: "created-ascending", label: "Date, old to new" },
  { value: "created-descending", label: "Date, new to old" },
];

export function SortSelect({ value, category, search, action = "/shop", preservedFilters = {}, options = sortOptions }: { value: string; category: string; search: string; action?: string; preservedFilters?: Record<string, string>; options?: SortOption[] }) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <form className="sort-select-form" action={action} method="get">
      {category && <input type="hidden" name="category" value={category} />}
      {search && <input type="hidden" name="q" value={search} />}
      {Object.entries(preservedFilters).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="sort-filter">
        <span>Sort by</span>
        <details className="sort-menu">
          <summary className="sort-menu-trigger" aria-label={`Sort by, currently ${selectedOption.label}`}>
            <span>{selectedOption.label}</span>
            <svg className="catalog-chevron sort-menu-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </summary>
          <div className="sort-menu-options" role="group" aria-label="Sort products">
            {options.map((option) => (
              <button key={option.value} type="submit" name="sort_by" value={option.value} aria-pressed={option.value === value}>
                <span>{option.label}</span><span className="sort-menu-check" aria-hidden="true">✓</span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </form>
  );
}
