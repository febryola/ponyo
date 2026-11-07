"use client";

import { useEffect, useRef, useState } from "react";

export function HomeStatCount({ value }: { value: number }) {
  const element = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(value);

  useEffect(() => {
    const node = element.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let startedAt = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setCount(0);
      const animate = (now: number) => {
        if (!startedAt) startedAt = now;
        const progress = Math.min(1, (now - startedAt) / 1100);
        setCount(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }, { threshold: 0.4 });

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={element} aria-label={String(value)}>{count}</span>;
}