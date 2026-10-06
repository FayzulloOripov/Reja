import type { Metadata, Viewport } from "next";
import { Onest, Schibsted_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { RootProviders } from "@/components/providers/root-providers";
import { themeInitScript } from "@/components/providers/theme";
import { APP_NAME } from "@/lib/env";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

const display = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  weight: ["600", "700", "800"],
  display: "swap",
});

// Schibsted Grotesk spaces the Uzbek ʻ (U+02BB) half an em wide, so headings read "bo ʻlimi".
// Onest's ʻ and ʼ, subset to a 1 KB file (OFL, renamed), sit first in the heading stack.
const uzApostrophe = localFont({
  src: "./fonts/uz-apostrophe.woff2",
  variable: "--font-uz-apostrophe",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+02BB-02BC" }],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("tagline"),
    applicationName: APP_NAME,
    appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1a16" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${onest.variable} ${display.variable} ${uzApostrophe.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <RootProviders>{children}</RootProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
