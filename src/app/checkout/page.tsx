import { SiteFrame } from "@/components/layout/site-frame";
import { CheckoutPageClient } from "@/components/layout/checkout-page-client";

export const metadata = { title: "Secure checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ buyNow?: string }> }) {
  const { buyNow } = await searchParams;
  return <SiteFrame className="store-page checkout-page" showNewsletter={false}><div className="store-container checkout-content"><CheckoutPageClient buyNow={buyNow === "1"} /></div></SiteFrame>;
}
