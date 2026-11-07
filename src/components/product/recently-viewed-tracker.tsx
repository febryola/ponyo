"use client";

import { useEffect } from "react";

const recentlyViewedKey = "ponyo:recent";

export function RecentlyViewedTracker({ slug }: { slug: string }) {
  useEffect(() => {
    let viewed: string[] = [];
    try { viewed = JSON.parse(localStorage.getItem(recentlyViewedKey) ?? "[]") as string[]; } catch { /* Start with an empty history. */ }
    const next = [slug, ...viewed.filter((item) => item !== slug)].slice(0, 8);
    try { localStorage.setItem(recentlyViewedKey, JSON.stringify(next)); } catch { /* Recent history is optional. */ }
    window.dispatchEvent(new CustomEvent("ponyo:recently-viewed", { detail: next }));
  }, [slug]);
  return null;
}
