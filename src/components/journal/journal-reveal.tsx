"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Content stays server-rendered and visible without JavaScript or motion support. */
export function JournalReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = node.querySelectorAll<HTMLElement>("[data-journal-reveal]");
    let observer: IntersectionObserver | undefined;

    function updateMotion() {
      observer?.disconnect();
      if (!node) return;
      if (motion.matches) {
        delete node.dataset.journalMotion;
        return;
      }
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-journal-visible");
          observer?.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -15% 0px", threshold: 0.15 });
      targets.forEach((target) => {
        if (!target.classList.contains("is-journal-visible")) observer?.observe(target);
      });
      node.dataset.journalMotion = "ready";
    }

    // Keyboard focus must never land in visually hidden content.
    function revealFocused(event: FocusEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target.closest<HTMLElement>("[data-journal-reveal]");
      if (target) {
        target.classList.add("is-journal-visible");
        observer?.unobserve(target);
      }
    }

    updateMotion();
    motion.addEventListener("change", updateMotion);
    node.addEventListener("focusin", revealFocused);
    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", updateMotion);
      node.removeEventListener("focusin", revealFocused);
      delete node.dataset.journalMotion;
    };
  }, []);

  return <div ref={root} className="journal-reveal-root">{children}</div>;
}