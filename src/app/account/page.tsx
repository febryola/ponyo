import { AccountAuthForm } from "@/components/account/account-auth-form";

export const metadata = { title: "Sign in to your account" };

export default function AccountPage() {
  return <AccountAuthForm mode="login" />;
}