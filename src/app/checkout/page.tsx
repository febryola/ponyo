import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { CheckoutPageClient } from "@/components/layout/checkout-page-client";

export const metadata = { title: "Secure checkout" };

export default function CheckoutPage() {
  return <SiteFrame className="store-page checkout-page" showNewsletter={false}><div className="store-container checkout-content"><nav className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/cart">Cart</Link><span>/</span><span>Checkout</span></nav><CheckoutPageClient /></div></SiteFrame>;
}
