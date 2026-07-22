-- Bridge Radar — external DeFiLlama reference-data cache.
-- v0 dev loop uses an equivalent SQLite schema baked into radar-core's SQLite Storage impl.
--
-- This is explicitly a SECONDARY / cross-verification data layer (whitepaper
-- context, not detection). One row per (category, key); payload is the
-- normalized JSON we chose to keep from that category's DeFiLlama response,
-- not the raw API blob, so the shape stays stable even as their API evolves.

CREATE TABLE IF NOT EXISTS defillama_cache (
    category    TEXT        NOT NULL, -- e.g. "chain_tvl", "stablecoins", "protocols"
    key         TEXT        NOT NULL, -- disambiguator within category: date, symbol, slug, or "solana"
    payload     JSONB       NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (category, key)
);

CREATE INDEX IF NOT EXISTS defillama_cache_category_idx
    ON defillama_cache (category, fetched_at DESC);
