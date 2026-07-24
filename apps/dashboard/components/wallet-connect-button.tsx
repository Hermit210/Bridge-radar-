"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/** Thin wrapper so the header stays a server component — this is the only
 * client boundary. Styling lives in globals.css (`.wallet-adapter-*`
 * overrides) rather than here, so it matches the rest of the theme. */
export function WalletConnectButton() {
  return <WalletMultiButton />;
}
