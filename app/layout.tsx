import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Analytics from "@/components/seo/Analytics";
import {
  OG_FALLBACK_PATH,
  OG_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  publicRobots
} from "@/lib/seo/metadata";

const bodyFont = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600"],
  display: "swap",
  preload: true,
  variable: "--font-body"
});

const headingFont = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
  preload: true,
  variable: "--font-heading"
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AgentOS — готовый отдел продаж и контента из ИИ-агентов",
    template: "%s | AgentOS"
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  referrer: "strict-origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  robots: publicRobots,
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icons/icon.svg"]
  },
  openGraph: {
    title: "AgentOS — готовый отдел продаж и контента из ИИ-агентов",
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "AgentOS — AI агенты для бизнеса"
      },
      {
        url: OG_FALLBACK_PATH,
        width: 1200,
        height: 630,
        alt: "AgentOS — OG fallback"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentOS — AI агенты для продаж и маркетинга",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH]
  },
  appleWebApp: {
    title: SITE_NAME,
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5C5BD6"
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ru">
      <body
        className={`${bodyFont.variable} ${headingFont.variable} bg-base text-[#2B2C4B] antialiased`}
      >
        <div className="relative min-h-screen bg-base">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-radial-glow opacity-80"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-grid bg-[size:120px_120px] opacity-10"
          />
          <div className="relative z-10">
            <AuthProvider>
              {children}
              <Analytics />
            </AuthProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
