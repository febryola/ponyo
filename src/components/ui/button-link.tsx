import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  appearance?: "dark" | "light";
};

export function ButtonLink({ appearance = "dark", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`button button-${appearance} ${className}`.trim()} {...props} />;
}
