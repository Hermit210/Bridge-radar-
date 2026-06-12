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
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-50 border-b border-border/50 bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="status-dot status-dot-green"></span>
              <span>Bridge Radar</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <Link href="/bridges" className="transition-colors duration-200 hover:text-accent">Bridges</Link>
              <Link href="/events" className="transition-colors duration-200 hover:text-accent">Events</Link>
              <Link href="/about" className="transition-colors duration-200 hover:text-accent">About</Link>
              <a href="https://github.com/Hermit210/Bridge-radar-/blob/master/WHITEPAPER.md" className="transition-colors duration-200 hover:text-accent" target="_blank" rel="noreferrer">Whitepaper</a>
              <a href="https://github.com/Hermit210/Bridge-radar-" className="transition-colors duration-200 hover:text-accent" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
            <div className="ml-auto rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">v0-preview</div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
        <footer className="border-t border-border/30 mt-20">
          <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-dark">
            Public-goods infrastructure. Built by Saloni Khan · MIT (code) · CC-BY 4.0 (docs) · No token.
          </div>
        </footer>
      </body>
    </html>
  );
}
