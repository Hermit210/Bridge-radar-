import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bridge Radar",
  description:
    "Real-time bridge-health intelligence layer for Solana. Open source, public good, no token.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-accent">●</span> Bridge Radar
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-text">Bridges</Link>
              <Link href="/events" className="hover:text-text">Events</Link>
              <Link href="/about" className="hover:text-text">About</Link>
              <a
                href="https://github.com/Pratikkale26/bridge-radar/blob/main/WHITEPAPER.md"
                className="hover:text-text"
                target="_blank"
                rel="noreferrer"
              >
                Whitepaper
              </a>
              <a
                href="https://github.com/Pratikkale26/bridge-radar"
                className="hover:text-text"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </nav>
            <div className="ml-auto text-xs text-muted">v0-preview</div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="border-t border-border mt-20">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted">
            Public-goods infrastructure. MIT (code) · CC-BY 4.0 (docs) · No token.
          </div>
        </footer>
      </body>
    </html>
  );
}
