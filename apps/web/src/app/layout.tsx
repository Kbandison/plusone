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
  /**
   * The home-screen icon on an iPhone, which had none.
   *
   * scripts/generate-icons.mjs has been drawing apple-touch-icon.png since the
   * icons existed and nothing has ever pointed at it. iOS looks for a
   * `rel="apple-touch-icon"` link or the file at the ORIGIN ROOT, and it is at
   * /icons/ — so neither. With no icon, iOS puts a SCREENSHOT OF THE PAGE on
   * the home screen: a shrunken sign-in form, sitting on a phone somebody else
   * may pick up, next to a name chosen so it would say nothing.
   *
   * And it is the iPhone install that matters most: Safari delivers web push
   * only to a site added to the home screen, so this is the path the whole
   * manifest exists to make work.
   */
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  /**
   * The older iOS switches. `display: standalone` in the manifest is what
   * iOS 16.4 and later read; these are what everything before it reads, and an
   * iPhone that has not been updated is exactly the one still on a version that
   * needs them.
   *
   * `title` rather than the manifest's, for the same reason short_name takes
   * the fallback: U+207A is missing from some launcher fonts and a member whose
   * phone cannot draw it gets a tofu box beside three letters.
   *
   * statusBarStyle stays `default`. `black-translucent` puts the page under the
   * clock, which is a look rather than a feature, and it is the setting that
   * hides a heading behind the status bar on every phone with a notch.
   */
  appleWebApp: {
    capable: true,
    title: BRAND.deviceNameFallback,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  /**
   * Lets the page reach into the rounded corners and under the home indicator,
   * which is the ONLY thing that makes env(safe-area-inset-*) report anything
   * but nought.
   *
   * Without it those insets are zero on every iPhone, so the fixed bottom nav
   * sat under the gesture bar in an installed app — the bar the member swipes
   * on, over the five links this app navigates by. Nothing said so on a desktop
   * or in a browser tab, because in a tab Safari's own chrome is in the way.
   *
   * It is a trade: cover means every pinned element now has to say how far it
   * is from the true edge. The nav and the two bottom sheets do.
   */
  viewportFit: "cover",
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
    <html
      lang="en"
      className={`${instrument.variable} ${satoshi.variable}`}
      suppressHydrationWarning
    >
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
