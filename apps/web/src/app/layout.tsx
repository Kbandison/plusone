import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";

import { BRAND, COPY } from "@plusone/config";

import "@/styles/globals.css";

// Instrument Serif carries the ⁺One wordmark — its high stroke contrast is what
// lets the superscript plus read as punctuation first and identity second (§3.1).
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

// Satoshi is not on Google Fonts, so it is self-hosted. Free under the Fontshare
// ITF licence — nothing in this build blocks on font procurement.
const satoshi = localFont({
  src: [
    { path: "./fonts/satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: COPY.marketing.sub,
  applicationName: BRAND.name,
  // The invite link gets posted in closed groups. Nothing in a link preview may
  // out anyone, so social cards inherit the neutral landing copy (§3.4).
  openGraph: {
    title: BRAND.name,
    description: COPY.referral.landingSub,
    siteName: BRAND.name,
    type: "website",
  },
  // Discretion (§9.5): the app is not something to be found by searching a
  // condition, and member surfaces are never indexed.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4EFE7" },
    { media: "(prefers-color-scheme: dark)", color: "#14110F" },
  ],
};

/**
 * Resolves the theme before first paint so the page never flashes Linen at
 * someone who chose Dusk. Kept inline and tiny — it must run before the body
 * renders, which rules out a component.
 */
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('plusone.theme');
    var theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${satoshi.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
