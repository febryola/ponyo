"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";

const slideCatalog = [
  { key: "rare", collection: "rare-finds", kicker: "HARD TO FIND", title: "Rare Finds", description: "Retired, discontinued, and limited-edition plush.", action: "Shop Rare Finds", href: "/shop?category=rare-finds", image: "/images/catalog/ponyo-2.png", imageAlt: "A lineup of soft plush toys sitting together" },
  { key: "xl", collection: "domina-xl", kicker: "DOMINA BY PONYO", title: "XL Goodies", description: "Big plush that fills a room, including Domina.", action: "Shop XL Goodies", href: "/shop?category=domina-xl", image: "/images/catalog/ponyo-3.png", imageAlt: "A person holding an oversized cream bunny plush" },
  { key: "premium", collection: "premium", kicker: "MADE TO LAST", title: "Premium Plushies", description: "Soft, well-made plush chosen for materials and craftsmanship.", action: "Shop Premium Plushies", href: "/shop?category=premium", image: "/images/catalog/ponyo-5.png", imageAlt: "A grid of soft premium plush friends" },
  { key: "new", collection: "new-arrival", kicker: "JUST LANDED", title: "New Discoveries", description: "Fresh finds from new brands and makers.", action: "See what is new", href: "/shop?category=new-arrival", image: "/images/catalog/ponyo-6.png", imageAlt: "A pile of new plush friends on a cosy bed" },
];

export function HomeCarousel({ hasCollectibles = false }: { hasCollectibles?: boolean }) {
  const slides = hasCollectibles ? [slideCatalog[0], slideCatalog[1], slideCatalog[2], { key: "collectibles", collection: "collectibles", kicker: "FOR COLLECTORS", title: "Collectibles", description: "Figurines and collectible toys.", action: "Shop Collectibles", href: "/shop?category=collectibles", image: "/images/catalog/ponyo-7.png", imageAlt: "A grid of collectible plush friends" }, slideCatalog[3]] : slideCatalog;
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const reduceMotion = useRef(false);
  const { t } = useLocalization();

  const copyKeys: Record<string, { kicker: string; title: string; description: string; action: string }> = {
    rare: { kicker: "home.slides.rare_eyebrow", title: "home.pillars.rare_title", description: "home.pillars.rare_body", action: "home.slides.rare_cta" },
    xl: { kicker: "home.slides.xl_eyebrow", title: "home.pillars.xl_title", description: "home.pillars.xl_body", action: "home.slides.xl_cta" },
    premium: { kicker: "home.slides.premium_eyebrow", title: "home.pillars.premium_title", description: "home.pillars.premium_body", action: "home.slides.premium_cta" },
    new: { kicker: "home.slides.new_eyebrow", title: "home.pillars.new_title", description: "home.pillars.new_body", action: "home.slides.new_cta" },
    collectibles: { kicker: "home.slides.collectibles_eyebrow", title: "home.pillars.collectibles_title", description: "home.pillars.collectibles_body", action: "home.slides.collectibles_cta" },
  };

  const markActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.min(slides.length - 1, Math.max(0, Math.round(Math.abs(track.scrollLeft) / track.clientWidth)));
    activeRef.current = index;
    setActive(index);
  }, [slides.length]);

  const goTo = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    if (!track) return;
    const normalized = (index + slides.length) % slides.length;
    activeRef.current = normalized;
    setActive(normalized);
    track.scrollTo({ left: normalized * track.clientWidth * (document.dir === "rtl" ? -1 : 1), behavior: smooth && !reduceMotion.current ? "smooth" : "auto" });
  }, [slides.length]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null || slides.length < 2 || reduceMotion.current || document.hidden) return;
    timerRef.current = window.setInterval(() => goTo(activeRef.current + 1), 7000);
  }, [goTo, slides.length]);

  const restart = useCallback(() => { stop(); start(); }, [start, stop]);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    start();
    const onVisibility = () => document.hidden ? stop() : start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, stop]);

  return (
    <section className="store-hero-carousel" aria-label={t("home.slides.label", "Featured plush")} aria-roledescription="carousel">
      <div className="store-hero-track" ref={trackRef} onScroll={markActive} onTouchStart={stop} onTouchEnd={restart}>
        {slides.map((slide, index) => <div className="store-hero-slide" key={slide.key} role="group" aria-roledescription="slide" aria-label={`${index + 1} / ${slides.length}`}>
          <Image className="store-hero-image" src={slide.image} alt={slide.imageAlt} fill priority={index === 0} sizes="(min-width: 1400px) 1400px, 100vw" />
          <div className="store-hero-overlay" aria-hidden="true" />
          <div className="store-hero-copy" aria-live={index === active ? "polite" : undefined}>
            <span className="store-hero-kicker">{t(copyKeys[slide.key]?.kicker ?? "", slide.kicker)}</span><h2>{t(copyKeys[slide.key]?.title ?? "", slide.title)}</h2><p>{t(copyKeys[slide.key]?.description ?? "", slide.description)}</p><Link className="store-hero-action" href={slide.href}>{t(copyKeys[slide.key]?.action ?? "", slide.action)}</Link>
          </div>
        </div>)}
      </div>
      <button className="store-hero-arrow previous" type="button" aria-label={t("home.slides.previous", "Previous slide")} onClick={() => { goTo(activeRef.current - 1); restart(); }}>‹</button>
      <button className="store-hero-arrow next" type="button" aria-label={t("home.slides.next", "Next slide")} onClick={() => { goTo(activeRef.current + 1); restart(); }}>›</button>
      <div className="store-hero-dots" role="group" aria-label="Choose featured collection">
        {slides.map((slide, index) => <button key={slide.key} type="button" className={index === active ? "is-active" : ""} aria-label={t("home.slides.go_to", `Go to slide ${index + 1}`, { number: index + 1 })} aria-current={index === active ? "true" : undefined} onClick={() => { goTo(index); restart(); }} />)}
      </div>
    </section>
  );
}
