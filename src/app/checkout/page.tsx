import { SiteFrame } from "@/components/layout/site-frame";
import { CheckoutPageClient } from "@/components/layout/checkout-page-client";
import { cookies } from "next/headers";
import { checkoutTranslations } from "@/locales/checkout-translations";

export async function generateMetadata() {
  const language = (await cookies()).get("ponyo-language")?.value ?? "en";
  return { title: checkoutTranslations[language]?.["checkout.heading"] ?? "Secure checkout" };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ buyNow?: string }> }) {
  const { buyNow } = await searchParams;
  return <SiteFrame className="store-page checkout-page" showNewsletter={false}><div className="store-container checkout-content"><CheckoutPageClient buyNow={buyNow === "1"} /></div></SiteFrame>;
}
