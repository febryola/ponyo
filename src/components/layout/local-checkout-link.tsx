import type { AnchorHTMLAttributes, ReactNode } from "react";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode };

/** Local checkout entry point; the checkout page starts the configured API session. */
export function LocalCheckoutLink({ children, href = "/checkout", ...props }: Props) {
  return <a {...props} href={href}>{children}</a>;
}
