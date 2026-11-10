"use client";

import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";

const footerGroups = [
  {
    titleKey: "home.footer.shop",
    title: "Shop",
    links: [
      ["home.footer.shop_all", "Shop All", "/collections/all"],
      ["home.footer.rare", "Rare Finds", "/collections/rare-finds"],
      ["home.footer.premium", "Premium Plushies", "/collections/premium"],
      ["home.footer.domina", "XL Goodies", "/collections/domina-xl"],
      ["home.footer.new", "New Arrivals", "/collections/new-arrivals"],
      ["home.footer.characters", "Cute Characters", "/collections/characters"],
    ],
  },
  {
    titleKey: "home.footer.explore",
    title: "Explore",
    links: [
      ["home.footer.about_link", "About Ponyo", "/pages/about"],
      ["home.footer.journal", "The Plush Journal", "/blogs/news"],
      ["home.footer.request", "Request a plush", "/pages/contact"],
      ["home.footer.partners", "Partner with Ponyo", "/pages/partners"],
    ],
  },
  {
    titleKey: "home.footer.support",
    title: "Support",
    links: [
      ["home.footer.faq", "FAQ & Shipping", "/pages/faq"],
      ["home.footer.drops", "Rare drop alerts", "/#drops"],
      ["home.footer.contact", "Contact Us", "/pages/contact"],
    ],
  },
] as const;

const jellyfishSizes = [28, 18, 24, 16, 28, 18, 24];

function Jellyfish({ size, dimmed = false }: { size: number; dimmed?: boolean }) {
  const fill = dimmed ? "#d9b9a9" : "#f4ddd3";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill={fill} />
      <circle cx="26" cy="23" r="2.4" fill="#2e211d" />
      <circle cx="38" cy="23" r="2.4" fill="#2e211d" />
      <path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" stroke={fill} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { t } = useLocalization();

  return (
    <footer className="store-footer">
      <div className="footer-wave" aria-hidden="true">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none"><path d="M0 40 C240 0 480 80 720 40 C960 0 1200 80 1440 40 L1440 80 L0 80Z" fill="#2e211d" /></svg>
      </div>
      <div className="footer-jellyfish" aria-hidden="true">
        {jellyfishSizes.map((size, index) => <span key={`${size}-${index}`} style={{ animationDelay: `${-index * 0.8}s`, opacity: size < 20 ? .7 : .95 }}><Jellyfish size={size} dimmed={size < 20} /></span>)}
      </div>
      <div className="footer-inner">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-brand-heading">
              <span className="footer-brand-mark"><Jellyfish size={28} /></span>
              <Link href="/" className="footer-wordmark">PONYO</Link>
            </div>
            <p>{t("home.footer.about", "A curated, multi-brand plush marketplace for rare finds, premium plushies and XL goodies. ♡")}</p>
          </div>
          {footerGroups.map((group) => (
            <nav className="footer-column" key={group.title} aria-label={t(group.titleKey, group.title)}>
              <h2>{t(group.titleKey, group.title)}</h2>
              {group.links.map(([key, fallback, href]) => <Link href={href} key={key}>{t(key, fallback)}</Link>)}
            </nav>
          ))}
        </div>
        <div className="footer-legal">
          <p>© {year} Ponyo. {t("home.footer.rights", "All rights reserved.")}</p>
          <nav aria-label={t("home.footer.policies", "Policies")}>
            <Link href="/pages/faq">{t("home.footer.privacy", "Privacy")}</Link>
            <Link href="/pages/faq">{t("home.footer.terms", "Terms")}</Link>
            <Link href="/pages/faq">{t("home.footer.shipping", "Shipping")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}