import { AccountDashboard } from "@/components/account/account-dashboard";
import { SiteFrame } from "@/components/layout/site-frame";

export const metadata = { title: "My Ponyo profile" };

export default function AccountPage() {
  return <SiteFrame className="store-page account-store-page" showNewsletter={false}><div className="store-container"><AccountDashboard /></div></SiteFrame>;
}