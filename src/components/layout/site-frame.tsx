import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { NewsletterPanel } from "@/components/layout/newsletter-panel";
import { SiteFooter } from "@/components/layout/site-footer";
import { LocalCartProvider } from "@/components/layout/local-cart-provider";

export function SiteFrame({ children, className = "", showNewsletter }: { children: ReactNode; className?: string; showNewsletter?: boolean }) {
  const showPageJellyfish = !className.includes("product-page") && !className.includes("cart-page") && !className.includes("checkout-page") && !className.includes("account") && !className.includes("collections-landing-page") && !className.includes("journal-page") && !className.includes("journal-article-page");
  const shouldShowNewsletter = showNewsletter ?? (
    !className.includes("product-page")
    && !className.includes("cart-page")
    && !className.includes("checkout-page")
    && !className.includes("account")
    && !className.includes("wishlist")
    && !className.includes("orders")
  );
  return (
    <>
      <SiteHeader />
      <LocalCartProvider />
      <main className={`store-main ${className}`.trim()} id="main-content">
        {showPageJellyfish && <span className="page-jellyfish-accent" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z"/><circle cx="26" cy="23" r="2.6"/><circle cx="38" cy="23" r="2.6"/><path d="M22 29c1.4 1.6 3 1.6 4.4 0M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10"/></svg></span>}
        {children}
      </main>
      {shouldShowNewsletter && <NewsletterPanel />}
      <SiteFooter />
    </>
  );
}
