"use client";

import { useMemo, type ReactNode } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
// Imported directly from each adapter's own package, NOT the
// @solana/wallet-adapter-wallets barrel — that barrel's index re-exports
// every adapter it bundles (including WalletConnect), which drags in
// @reown/appkit -> viem -> pino (a Node-only logger) into the browser
// bundle regardless of which named exports are actually used. Direct
// imports keep the bundle to only what's actually wired in below.
import { CoinbaseWalletAdapter } from "@solana/wallet-adapter-coinbase";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-ledger";
import { TorusWalletAdapter } from "@solana/wallet-adapter-torus";
import "@solana/wallet-adapter-react-ui/styles.css";

/** Browser-extension wallets (Phantom, Solflare, Backpack, and any other
 * Wallet-Standard-compliant wallet) register themselves automatically and
 * need no adapter here — there is no real, maintained `@solana/wallet-
 * adapter-*` package for Backpack specifically; it has only ever shipped
 * as a Wallet Standard wallet, so Wallet Standard auto-detection is the
 * complete, real way to support it, not a gap to fill.
 *
 * The three adapters below cover wallets that Wallet Standard genuinely
 * can't reach, because they aren't a browser extension announcing itself
 * on the page: Ledger is a hardware device (WebUSB/WebHID), and Coinbase
 * Wallet / Torus can be reached over their own connection protocols in
 * addition to (or instead of) a browser extension. All three come from
 * their own actively-maintained `@solana/wallet-adapter-{coinbase,ledger,
 * torus}` packages (imported directly, not via the `wallet-adapter-
 * wallets` barrel — see the import comment above) — nothing here is a
 * custom-built integration. */
export function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new CoinbaseWalletAdapter(), new LedgerWalletAdapter(), new TorusWalletAdapter()],
    [],
  );

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
