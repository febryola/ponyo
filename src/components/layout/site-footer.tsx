import Link from "next/link";

const footerGroups = [
  {
    title: "Shop",
    links: [
      ["Shop All", "/collections/all"],
      ["Rare Finds", "/collections/rare-finds"],
      ["Premium Plushies", "/collections/premium"],
      ["XL Goodies", "/collections/domina-xl"],
      ["New Arrivals", "/collections/new-arrivals"],
      ["Cute Characters", "/collections/characters"],
    ],
  },
  {
    title: "Explore",
    links: [
      ["About Ponyo", "/pages/about"],
      ["The Plush Journal", "/blogs/news"],
      ["Request a plush", "/pages/contact"],
    ],
  },
  {
    title: "Support",
    links: [
      ["FAQ & Shipping", "/pages/faq"],
      ["Rare drop alerts", "/#drops"],
      ["Contact Us", "/pages/contact"],
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
            <p>A curated, multi-brand plush marketplace for rare finds, premium plushies and XL goodies. ♡</p>
          </div>
          {footerGroups.map((group) => (
            <nav className="footer-column" key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              {group.links.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}
            </nav>
          ))}
        </div>
        <div className="footer-legal">
          <p>© {year} Ponyo. All rights reserved.</p>
          <nav aria-label="Policies">
            <Link href="/pages/faq">Privacy</Link>
            <Link href="/pages/faq">Terms</Link>
            <Link href="/pages/faq">Shipping</Link>
          </nav>
          <span>Powered by Shopify</span>
        </div>
      </div>
    </footer>
  );
}