import { AccountAuthForm } from "@/components/account/account-auth-form";

export const metadata = { title: "Create a Ponyo account" };

export default function AccountRegisterPage() {
  return <AccountAuthForm mode="register" />;
}
