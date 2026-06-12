import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bridge Radar",
  description: "Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-sans antialiased relative">
        <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-5">
            <Link href="/" className="group flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <span className="status-dot status-dot-green" style={{ width: 12, height: 12 }}></span>
              <span className="gradient-text-vivid">Bridge Radar</span>
            </Link>
            <nav className="flex items-center gap-8 text-sm font-medium text-muted">
              <Link href="/bridges" className="transition-colors duration-200 hover:text-accent hover:border-b hover:border-accent/40 pb-0.5">Bridges</Link>
              <Link href="/events" className="transition-colors duration-200 hover:text-accent hover:border-b hover:border-accent/40 pb-0.5">Events</Link>
              <Link href="/about" className="transition-colors duration-200 hover:text-accent hover:border-b hover:border-accent/40 pb-0.5">About</Link>
              <a href="https://github.com/Hermit210/Bridge-radar-/blob/master/WHITEPAPER.md" className="transition-colors duration-200 hover:text-accent hover:border-b hover:border-accent/40 pb-0.5" target="_blank" rel="noreferrer">Whitepaper</a>
              <a href="https://github.com/Hermit210/Bridge-radar-" className="transition-colors duration-200 hover:text-accent hover:border-b hover:border-accent/40 pb-0.5" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
            <div className="ml-auto badge">v0-preview</div>
          </div>
          <div className="section-divider" />
        </header>
        <main className="relative z-10 mx-auto max-w-7xl px-6 py-10">{children}</main>
        <footer className="mt-20">
          <div className="section-divider" />
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="status-dot status-dot-green" style={{ width: 8, height: 8 }}></span>
                  <span className="text-gradient">Bridge Radar</span>
                </div>
                <p className="text-xs text-muted-dark leading-relaxed">
                  Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Links</p>
                <div className="flex flex-col gap-2 text-xs text-muted-dark">
                  <Link href="/bridges" className="hover:text-accent transition-colors">Dashboard</Link>
                  <Link href="/events" className="hover:text-accent transition-colors">Events</Link>
                  <Link href="/about" className="hover:text-accent transition-colors">About</Link>
                  <a href="https://github.com/Hermit210/Bridge-radar-" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">GitHub</a>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Built with</p>
                <p className="text-xs text-muted-dark leading-relaxed">
                  Powered by Solana. MIT (code) &middot; CC-BY 4.0 (docs).
                </p>
                <p className="text-xs text-muted-dark">
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
