/**
 * On-demand DeFiLlama token price lookup. The nine scheduled DeFiLlama
 * categories (bridges, stablecoins, protocols, ...) are read straight off
 * `RadarDb.defillamaList`/`defillamaGet` (see db.ts) — that table is
 * populated by the `radar-defillama` Rust service (crates/radar-defillama),
 * this file does not fetch those itself.
 */

// ── On-demand token price (item 5) ──────────────────────────────────────────
//
// Unlike the other eight categories, prices are looked up by arbitrary mint
// on demand (used as a Pyth-staleness fallback, and here for dashboard
// debugging), not synced on a fixed schedule — so this talks to DeFiLlama
// directly with a small in-process cache, matching the 5-minute TTL used by
// the Rust client (crates/radar-core/src/defillama/client.rs).

interface CachedPrice {
  mint: string;
  symbol: string;
  price_usd: number;
  source_timestamp: string;
  fetched_at: string;
}

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const priceCache = new Map<string, { value: CachedPrice; cachedAt: number }>();

export async function fetchDefiLlamaPrice(mint: string): Promise<CachedPrice | { error: string }> {
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) {
    return cached.value;
  }

  const coinId = `solana:${mint}`;
  let resp: Response;
  try {
    resp = await fetch(`https://coins.llama.fi/prices/current/${coinId}`, {
      headers: { "User-Agent": "bridge-radar/0.1" },
    });
  } catch (error) {
    return { error: `DeFiLlama request failed: ${(error as Error).message}` };
  }
  if (!resp.ok) {
    return { error: `DeFiLlama returned HTTP ${resp.status}` };
  }
  const data = (await resp.json()) as { coins?: Record<string, { symbol: string; price: number; timestamp: number }> };
  const entry = data.coins?.[coinId];
  if (!entry) {
    return { error: `no price entry for ${mint}` };
  }
  const value: CachedPrice = {
    mint,
    symbol: entry.symbol,
    price_usd: entry.price,
    source_timestamp: new Date(entry.timestamp * 1000).toISOString(),
    fetched_at: new Date().toISOString(),
  };
  priceCache.set(mint, { value, cachedAt: Date.now() });
  return value;
}
