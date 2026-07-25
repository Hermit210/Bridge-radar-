/**
 * Real, read-only snapshot of a connected wallet's current SOL balance and
 * SPL token holdings — via getBalance and getTokenAccountsByOwner against
 * Solana mainnet (SOLANA_RPC_URL), the same connection wallet-activity.ts
 * uses. USD values come from DeFiLlama's live coins API where a price is
 * actually available; when it isn't, valueUsd is null and callers must
 * present that honestly rather than showing $0.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { fetchDefiLlamaPrice } from "./defillama-store.js";

// Well-known, permanent Solana program IDs — not a dependency on
// @solana/spl-token for two constants.
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
// Wrapped SOL mint — DeFiLlama prices native SOL under this coinId, and it
// tracks native SOL 1:1, so it's the real way to get a live SOL/USD price
// from the same source used for every other token here.
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface WalletHoldingsToken {
  mint: string;
  uiAmount: number;
  decimals: number;
  /** Real symbol from DeFiLlama when a price was found; null otherwise —
   * never guessed from the mint address. */
  symbol: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface WalletHoldingsResult {
  address: string;
  solBalance: number;
  solPriceUsd: number | null;
  solValueUsd: number | null;
  tokens: WalletHoldingsToken[];
  fetchedAt: string;
}

async function priceFor(mint: string): Promise<{ symbol: string | null; priceUsd: number | null }> {
  const result = await fetchDefiLlamaPrice(mint).catch(() => ({ error: "fetch threw" }) as const);
  if ("error" in result) return { symbol: null, priceUsd: null };
  return { symbol: result.symbol, priceUsd: result.price_usd };
}

export async function fetchWalletHoldings(connection: Connection, address: string): Promise<WalletHoldingsResult> {
  const pubkey = new PublicKey(address);

  const [lamports, legacyAccounts, token2022Accounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: new PublicKey(TOKEN_PROGRAM_ID) }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: new PublicKey(TOKEN_2022_PROGRAM_ID) }),
  ]);

  const solBalance = lamports / 1e9;

  const rawTokens = [...legacyAccounts.value, ...token2022Accounts.value]
    .map((acc) => {
      const info = acc.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null; decimals: number };
      };
      return { mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0, decimals: info.tokenAmount.decimals };
    })
    // Closed-but-not-yet-reclaimed accounts and empty ATAs report a real
    // zero balance — not a holding, so not shown as one.
    .filter((t) => t.uiAmount > 0);

  const [solPrice, ...tokenPrices] = await Promise.all([
    priceFor(WRAPPED_SOL_MINT),
    ...rawTokens.map((t) => priceFor(t.mint)),
  ]);

  const tokens: WalletHoldingsToken[] = rawTokens.map((t, i) => {
    const { symbol, priceUsd } = tokenPrices[i] ?? { symbol: null, priceUsd: null };
    const valueUsd = priceUsd !== null ? t.uiAmount * priceUsd : null;
    return { mint: t.mint, uiAmount: t.uiAmount, decimals: t.decimals, symbol, priceUsd, valueUsd };
  });

  // Priced holdings first (highest value first), then unpriced holdings by
  // raw amount — real ordering, never a fabricated "top holdings" guess.
  tokens.sort((a, b) => {
    if (a.valueUsd !== null && b.valueUsd !== null) return b.valueUsd - a.valueUsd;
    if (a.valueUsd !== null) return -1;
    if (b.valueUsd !== null) return 1;
    return b.uiAmount - a.uiAmount;
  });

  return {
    address,
    solBalance,
    solPriceUsd: solPrice.priceUsd,
    solValueUsd: solPrice.priceUsd !== null ? solBalance * solPrice.priceUsd : null,
    tokens,
    fetchedAt: new Date().toISOString(),
  };
}
