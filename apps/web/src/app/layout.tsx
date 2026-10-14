import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";

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
 * Fonts are downloaded at build time by next/font and served from our own
 * origin: no request to Google at runtime (GDPR) and CSP stays font-src 'self'.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-app-sans",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
  variable: "--font-app-heading",
});
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`h-full ${inter.variable} ${poppins.variable}`}>
      <body className="flex min-h-full flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
