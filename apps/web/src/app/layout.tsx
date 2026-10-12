import type { Metadata, Viewport } from "next";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Trajio",
    template: "%s | Trajio",
  },
  description:
    "Trajio met en relation les conducteurs et les passagers qui vont dans la meme direction.",
  applicationName: "Trajio",
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
};

/**
 * No webfont is loaded on purpose: the build stays fully offline-capable and
 * avoids a third-party request that would have to be disclosed under GDPR.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full">
      <body className="flex min-h-full flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
