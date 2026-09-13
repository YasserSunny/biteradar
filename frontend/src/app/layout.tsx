import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BiteRadar | AI-Powered Restaurant & Dish Finder",
  description: "Find the best dish in town, ranked by Gemini AI with authentic customer reviews and sentiment.",
  icons: {
    icon: [
      { url: "/icon.png?v=2", sizes: "128x128", type: "image/png" },
      { url: "/favicon.ico?v=2", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: "/icon.png?v=2",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
