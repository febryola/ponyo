"use client";

export function CategoryScrollButton() {
  return (
    <button
      className="category-arrow"
      type="button"
      aria-label="Scroll categories"
      onClick={() => document.querySelector(".category-list")?.scrollBy({ left: 220, behavior: "smooth" })}
    >
      →
    </button>
  );
}
