import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="section-wrap page-shell">{children}</main>
      <footer className="site-footer section-wrap">
        <Link href="/" className="wordmark">ponyo<span>®</span></Link>
        <p>Teman kecil, cerita besar.</p>
        <span>© {new Date().getFullYear()} Ponyo</span>
      </footer>
    </>
  );
}
