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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://yarri.com"),
  title: {
    default: "Yarri | Real People. Real Connections.",
    template: "%s | Yarri",
  },
  description:
    "Meet your way with Yarri: solo, with a friend, or as a group. Real people and real connections on iOS and Android.",
  applicationName: "Yarri",
  keywords: ["Yarri", "dating app", "solo dating", "duo dating", "group dating"],
  openGraph: {
    title: "Yarri | Real People. Real Connections.",
    description: "One app. Three ways to meet: Solo, Duo, and Group.",
    type: "website",
    images: [{ url: "/yarri-welcome.png", width: 853, height: 1844, alt: "Yarri" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
