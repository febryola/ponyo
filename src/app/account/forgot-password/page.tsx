import { AccountAuthForm } from "@/components/account/account-auth-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <AccountAuthForm mode="forgot" />;
}
