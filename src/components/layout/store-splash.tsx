"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export function StoreSplash() {
  const splashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = splashRef.current;
    if (!node) return;

    // Keep the brand cue brief, like a marketplace handoff, rather than blocking browsing.
    const dismissTimer = window.setTimeout(() => node.classList.add("is-leaving"), 530);
    const removeTimer = window.setTimeout(() => {
      node.setAttribute("hidden", "hidden");
      node.dispatchEvent(new Event("ponyo:splash-finished"));
    }, 850);

    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  return (
    <div ref={splashRef} className="store-splash" role="status" aria-label="Welcome to Ponyo">
      <div className="store-splash-content">
        <Image className="store-splash-jellyfish" src="/ponyo-jellyfish.svg" alt="" width={96} height={96} priority />
        <strong>PONYO</strong>
        <span>Meet your next forever plush.</span>
      </div>
    </div>
  );
}
