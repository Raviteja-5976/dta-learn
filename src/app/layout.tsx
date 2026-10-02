import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Fonts are self-hosted by next/font, so they load on the cross-origin
// isolated terminal route too (no third-party font requests).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "DevTrackAcademy Learn — learn by doing in real environments",
    template: "%s · DevTrackAcademy Learn",
  },
  description:
    "Interactive developer courses: read a short article, do it in a real Linux terminal or code editor in your browser, get checked automatically, and move on.",
  icons: { icon: "/icon.svg" },
};

// Every page depends on the signed-in user or live course data.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#FFF8F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
