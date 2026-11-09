import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Libre_Baskerville, Nunito_Sans } from "next/font/google";
import { StoreSplash } from "@/components/layout/store-splash";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { LocalizationProvider } from "@/components/layout/localization-provider";
import { CustomerSessionProvider } from "@/components/layout/customer-session-provider";
import "./globals.css";
import "./ponyo-foundation.css";
import "./storefront.css";
import "./theme-parity.css";
import "./theme-parity-polish.css";
import "./collection-theme.css";

const bodyFont = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const headingFont = Libre_Baskerville({ subsets: ["latin"], weight: ["700"], variable: "--font-libre-baskerville", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Ponyo — Your World of Cuteness",
    template: "%s | Ponyo",
  },
  description: "Rare finds, premium favorites, and giant plush companions—hand-picked for you.",
  icons: {
    icon: "/ponyo-jellyfish.svg",
    shortcut: "/ponyo-jellyfish.svg",
    apple: "/ponyo-jellyfish.svg",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const initialLanguage = cookieStore.get("ponyo-language")?.value ?? "en";
  const initialCurrency = cookieStore.get("ponyo-currency")?.value ?? "JPY";
  const initialCountry = cookieStore.get("ponyo-country")?.value ?? "JP";
  const initialDeliveryNoticeDismissed = cookieStore.get("ponyo-delivery-notice-dismissed")?.value === "1";
  const savedCookieConsent = cookieStore.get("ponyo-cookie-consent")?.value;
  const initialCookieConsent = savedCookieConsent === "all" || savedCookieConsent === "necessary" || savedCookieConsent === "custom" ? savedCookieConsent : null;
  const initialAnalyticsConsent = cookieStore.get("ponyo-analytics-consent")?.value === "1";
  const initialMarketingConsent = cookieStore.get("ponyo-marketing-consent")?.value === "1";
  return (
    <html lang={initialLanguage} className="h-full antialiased">
      <body className={`min-h-full ${bodyFont.variable} ${headingFont.variable}`}>
        <LocalizationProvider initialLanguage={initialLanguage} initialCurrency={initialCurrency} initialCountry={initialCountry} initialDeliveryNoticeDismissed={initialDeliveryNoticeDismissed}>
          <CustomerSessionProvider>
            <StoreSplash />
            <CookieConsentBanner initialConsent={initialCookieConsent} initialAnalyticsConsent={initialAnalyticsConsent} initialMarketingConsent={initialMarketingConsent} />
            {children}
          </CustomerSessionProvider>
        </LocalizationProvider>
      </body>
    </html>
  );
}
