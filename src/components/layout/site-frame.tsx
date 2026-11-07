import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { NewsletterPanel } from "@/components/layout/newsletter-panel";
import { SiteFooter } from "@/components/layout/site-footer";
import { ShopifyCartProvider } from "@/components/layout/shopify-cart-provider";

export function SiteFrame({ children, className = "", showNewsletter }: { children: ReactNode; className?: string; showNewsletter?: boolean }) {
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
      <ShopifyCartProvider />
      <main className={`store-main ${className}`.trim()} id="main-content">{children}</main>
      {shouldShowNewsletter && <NewsletterPanel />}
      <SiteFooter />
    </>
  );
}
