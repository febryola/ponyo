import { AccountAddressBook } from "@/components/account/account-address-book";
import { SiteFrame } from "@/components/layout/site-frame";

export const metadata = { title: "Delivery addresses" };

export default function AccountAddressesPage() {
  return <SiteFrame className="store-page account-store-page" showNewsletter={false}><div className="store-container"><AccountAddressBook /></div></SiteFrame>;
}
