import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Instrument_Serif, JetBrains_Mono, Outfit } from "next/font/google";
import { WalletProviders } from "@/components/wallet-providers";
import { WalletConnectButton } from "@/components/wallet-connect-button";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif-accent",
  display: "swap",
  weight: ["400"],
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  title: "Bridge Radar",
  description: "Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <WalletProviders>
          <header className="sticky top-3 z-50 px-3 sm:top-4 sm:px-4">
            <div className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto rounded-full border border-border-subtle bg-surface-0/85 px-5 py-3 shadow-card backdrop-blur-xl sm:gap-8 sm:px-7">
              <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[15px] font-display font-semibold tracking-[-0.01em] text-text">
                <span className="status-dot status-dot-green"></span>
                Bridge Radar
              </Link>
              <nav className="flex shrink-0 items-center gap-5 whitespace-nowrap text-[13px] font-medium text-text-secondary sm:gap-7">
                <Link href="/bridges" className="transition-colors duration-150 hover:text-text">Bridges</Link>
                <Link href="/bridges/compare" className="transition-colors duration-150 hover:text-text">Compare</Link>
                <Link href="/events" className="transition-colors duration-150 hover:text-text">Events</Link>
                <Link href="/my-activity" className="transition-colors duration-150 hover:text-text">My Activity</Link>
                <Link href="/about" className="transition-colors duration-150 hover:text-text">About</Link>
              </nav>
              <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
                <div className="badge hidden text-[11px] font-medium sm:inline-flex">v0-preview</div>
                <WalletConnectButton />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
          <footer className="mt-20 border-t border-border/30">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-[15px] font-display font-semibold tracking-[-0.01em] text-text">
                  <span className="status-dot status-dot-green"></span>
                  Bridge Radar
                </div>
                <p className="text-xs text-muted-dark leading-[1.7] font-medium">
                  Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.1em] text-muted">Links</p>
                <div className="flex flex-col gap-1.5 text-xs text-muted-dark font-medium">
                  <Link href="/bridges" className="hover:text-text transition-colors">Dashboard</Link>
                  <Link href="/bridges/compare" className="hover:text-text transition-colors">Compare bridges</Link>
                  <Link href="/events" className="hover:text-text transition-colors">Events</Link>
                  <Link href="/about" className="hover:text-text transition-colors">About</Link>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.1em] text-muted">Built with</p>
                <p className="text-xs text-muted-dark leading-[1.7] font-medium">
                  Powered by Solana. MIT (code) &middot; CC-BY 4.0 (docs).
                </p>
                <p className="text-xs text-muted-dark font-medium">
                  Built by Saloni Khan.
                </p>
              </div>
            </div>
          </div>
          </footer>
        </WalletProviders>
      </body>
    </html>
  );
}
