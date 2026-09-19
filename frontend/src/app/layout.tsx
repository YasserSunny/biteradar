import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { initialThemeScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#151719" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://biteradar.web.app",
  ),
  title: {
    default: "BiteRadar | AI-Powered Restaurant & Dish Finder",
    template: "%s | BiteRadar",
  },
  description:
    "Find the best dish in town, ranked by Gemini AI with authentic customer reviews, diner tips, and sentiment.",
  applicationName: "BiteRadar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    shortcut: "/icon.svg",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BiteRadar",
  },
  openGraph: {
    title: "BiteRadar | AI-Powered Restaurant & Dish Finder",
    description:
      "Find the best dish in town, ranked by Gemini AI with authentic diner sentiment and tips.",
    url: "/",
    siteName: "BiteRadar",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BiteRadar AI Restaurant & Dish Radar",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BiteRadar | AI-Powered Restaurant & Dish Finder",
    description:
      "Find the best dish in town, ranked by Gemini AI with authentic diner sentiment and tips.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialThemeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
