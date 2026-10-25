import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

import { NavBar } from "@/components/NavBar";
import { getSession } from "@/lib/session";

import { Providers } from "./providers";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ChainTrace", template: "%s · ChainTrace" },
  description: "Trace restaurant ingredients from source to plate — verifiable on Solana.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07090d",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The header is rendered here, once, so it persists across navigations
  // (only the page content swaps, with loading.tsx as its fallback). Pages
  // that need an authenticated session still enforce it themselves via
  // guard.ts; this only decides whether to show the nav.
  const session = await getSession();

  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <Providers>
          {session ? <NavBar roles={session.roles} wallet={session.wallet} /> : null}
          {children}
        </Providers>
      </body>
    </html>
  );
}
