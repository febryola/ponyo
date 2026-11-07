import type { Metadata } from "next";
import { Libre_Baskerville, Nunito_Sans } from "next/font/google";
import "./globals.css";
import "@/ponyo-shopify/assets/styles.min.css";
import "./storefront.css";
import "./theme-parity.css";
import "./theme-parity-polish.css";
import "./collection-theme.css";

const bodyFont = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const headingFont = Libre_Baskerville({ subsets: ["latin"], weight: ["700"], variable: "--font-libre-baskerville", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Ponyo — Rare, premium & giant plush",
    template: "%s | Ponyo",
  },
  description: "Rare finds, premium favorites, and giant plush companions—hand-picked for you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`min-h-full ${bodyFont.variable} ${headingFont.variable}`}>{children}</body>
    </html>
  );
}
