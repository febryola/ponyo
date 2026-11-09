"use client";

import type { ProductPriceHistoryEntry } from "@/types/product";
import { useLocalization } from "@/components/layout/localization-provider";

export function ProductPriceHistory({ history, currency }: { history: ProductPriceHistoryEntry[]; currency: string }) {
  const { formatPrice } = useLocalization();
  const entries = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lowestPrice = entries.length ? Math.min(...entries.map((entry) => entry.price)) : null;
  const isPreviewHistory = entries.length === 1 && entries[0].date === "2026-11-09" && currency === "JPY";

  return <section className="product-price-history" aria-labelledby="product-price-history-title">
    <div className="product-price-history-heading">
      <span className="product-price-history-icon" aria-hidden="true">↗</span>
      <div><p className="eyebrow">PRICE TRANSPARENCY</p><h2 id="product-price-history-title">Price history</h2></div>
    </div>
    {isPreviewHistory && <p className="product-price-history-preview">Preview catalog data</p>}
    {entries.length ? <>
      <p className="product-price-history-lowest">Lowest recorded price <strong>{formatPrice(lowestPrice!, currency)}</strong></p>
      <div className="product-price-history-table-wrap"><table>
        <thead><tr><th scope="col">Date</th><th scope="col">Price</th></tr></thead>
        <tbody>{entries.slice().reverse().map((entry, index) => <tr key={`${entry.date}-${index}`}><td>{entry.date}</td><td>{formatPrice(entry.price, currency)}</td></tr>)}</tbody>
      </table></div>
    </> : <p className="product-price-history-empty">We’ll show tracked prices here as this plush’s price changes.</p>}
  </section>;
}
