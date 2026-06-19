import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";

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

export const metadata: Metadata = {
  title: "Bridge Radar",
  description: "Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-50 bg-bg/85 backdrop-blur-xl border-b border-border/40">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-display font-semibold tracking-[-0.01em] text-text">
              <span className="status-dot status-dot-green"></span>
              Bridge Radar
            </Link>
            <nav className="flex items-center gap-7 text-[13px] font-medium text-text-secondary">
              <Link href="/bridges" className="transition-colors duration-150 hover:text-text">Bridges</Link>
              <Link href="/events" className="transition-colors duration-150 hover:text-text">Events</Link>
              <Link href="/about" className="transition-colors duration-150 hover:text-text">About</Link>
              <a href="https://github.com/Hermit210/Bridge-radar-/blob/master/WHITEPAPER.md" className="transition-colors duration-150 hover:text-text" target="_blank" rel="noreferrer">Whitepaper</a>
              <a href="https://github.com/Hermit210/Bridge-radar-" className="transition-colors duration-150 hover:text-text" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
            <div className="ml-auto badge text-[11px] font-medium">v0-preview</div>
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
                  <Link href="/events" className="hover:text-text transition-colors">Events</Link>
                  <Link href="/about" className="hover:text-text transition-colors">About</Link>
                  <a href="https://github.com/Hermit210/Bridge-radar-" target="_blank" rel="noreferrer" className="hover:text-text transition-colors">GitHub</a>
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
      </body>
    </html>
  );
}
