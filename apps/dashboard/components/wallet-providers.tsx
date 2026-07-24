"use client";

import { useMemo, type ReactNode } from "react";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

/** No explicit adapter list — Phantom, Solflare, Backpack etc. register
 * themselves via the Wallet Standard and are auto-detected in the browser. */
export function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}
