import { SiteFrame } from "@/components/layout/site-frame";
import { LocalOrdersPanel } from "@/components/account/local-orders-panel";

export const metadata = { title: "Order history" };

export default function OrdersPage() {
  return <SiteFrame className="store-page orders-page" showNewsletter={false}><div className="store-container"><LocalOrdersPanel /></div></SiteFrame>;
}