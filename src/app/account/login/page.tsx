import { AccountAuthForm } from "@/components/account/account-auth-form";

export const metadata = { title: "Sign in to your account" };

export default function AccountLoginPage() {
  return <AccountAuthForm mode="login" />;
}
