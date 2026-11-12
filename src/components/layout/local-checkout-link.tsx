import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode };

/** Local checkout entry point; the checkout page starts the configured API session. */
export function LocalCheckoutLink({ children, href = "/checkout", ...props }: Props) {
  return <Link {...props} href={href}>{children}</Link>;
}
