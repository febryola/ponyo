import { SiteFrame } from "@/components/layout/site-frame";
import { CartPageClient } from "@/components/layout/cart-page-client";

export const metadata = { title: "Your cart" };

export default function CartPage() {
  return <SiteFrame className="store-page cart-page" showNewsletter={false}><CartPageClient /></SiteFrame>;
}
