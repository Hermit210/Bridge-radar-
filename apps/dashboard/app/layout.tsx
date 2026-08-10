import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Instrument_Serif, JetBrains_Mono, Outfit } from "next/font/google";
import { WalletProviders } from "@/components/wallet-providers";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { TelegramIcon, DiscordIcon } from "@/components/social-icons";
import { NavLinks } from "@/components/nav-links";

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
            <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 rounded-full border border-border-subtle bg-surface-0/85 px-5 py-3 shadow-card backdrop-blur-xl sm:gap-6 sm:px-7">
              <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[15px] font-display font-semibold tracking-[-0.01em] text-text">
                <span className="status-dot status-dot-green"></span>
                Bridge Radar
              </Link>
              <nav className="flex items-center justify-center gap-5 overflow-x-auto whitespace-nowrap text-[13px] font-medium text-text-secondary sm:gap-7">
                <NavLinks />
              </nav>
              <div className="flex shrink-0 items-center justify-end gap-3 whitespace-nowrap">
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
                  <Link href="/network" className="hover:text-text transition-colors">Network</Link>
                  <Link href="/developers" className="hover:text-text transition-colors">Developers</Link>
                  <Link href="/about" className="hover:text-text transition-colors">About</Link>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.1em] text-muted">Community</p>
                <div className="flex flex-col gap-2 text-xs text-muted-dark font-medium">
                  <a
                    href="https://t.me/bruhalert_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-text"
                  >
                    <TelegramIcon className="h-3.5 w-3.5 shrink-0" />
                    Get real-time bridge health alerts on Telegram
                  </a>
                  <a
                    href="https://discord.gg/nFShyzP7G"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-text"
                  >
                    <DiscordIcon className="h-3.5 w-3.5 shrink-0" />
                    Join our Discord
                  </a>
                </div>
              </div>
            </div>
          </div>
          </footer>
        </WalletProviders>
      </body>
    </html>
  );
}
