import type { Metadata } from "next";
import "./globals.css";
import "@/sample-frontend/styles.css";

export const metadata: Metadata = {
  title: {
    default: "Ponyo — teman kecil untuk hari-hari besar",
    template: "%s | Ponyo",
  },
  description: "Temukan plushie pilihan dari supplier terpercaya, dikurasi dengan penuh perhatian.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
