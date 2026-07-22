/**
 * Reader for the `defillama_cache` table populated by the `radar-defillama`
 * Rust service (crates/radar-defillama). This file does NOT fetch from
 * DeFiLlama itself for scheduled categories — it only reads what the Rust
 * sync already cached, with real `fetched_at` timestamps.
 *
 * External reference data only. Every response carries `source: "defillama"`
 * so it's never confused with our own primary on-chain-derived detection
 * data. If a category has never been synced (Rust service not running yet)
 * or is genuinely unavailable (Pro-only, no key), callers get an honest
 * empty/unavailable state — never fabricated numbers.
 */

import type Database from "better-sqlite3";

export interface DefiLlamaRow {
  category: string;
  key: string;
  payload: string;
  fetched_at: string;
}

export class DefiLlamaStore {
  constructor(private db: Database.Database) {}

  private ensureTable() {
    // The Rust sync service owns this table's schema; this is a defensive
    // no-op create so /v1/defillama/* doesn't 500 if the API starts before
    // radar-defillama has ever run once.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS defillama_cache (
        category    TEXT NOT NULL,
        key         TEXT NOT NULL,
        payload     TEXT NOT NULL,
        fetched_at  TEXT NOT NULL,
        PRIMARY KEY (category, key)
      );
    `);
  }

  /** All rows for a category (e.g. every stablecoin, every tracked bridge's protocol TVL). */
  list(category: string): DefiLlamaRow[] {
    this.ensureTable();
    return this.db
      .prepare(
        "SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = ? ORDER BY key",
      )
      .all(category) as DefiLlamaRow[];
  }

  /** The single row for a snapshot category (e.g. chain_tvl/solana). */
  get(category: string, key: string): DefiLlamaRow | undefined {
    this.ensureTable();
    return this.db
      .prepare("SELECT category, key, payload, fetched_at FROM defillama_cache WHERE category = ? AND key = ?")
      .get(category, key) as DefiLlamaRow | undefined;
  }
}

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
