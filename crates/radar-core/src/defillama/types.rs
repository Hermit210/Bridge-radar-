//! Response shapes for the DeFiLlama endpoints we consume, verified against
//! live API responses (not guessed) on 2026-07-22. Each `*Raw` type mirrors
//! the wire format loosely — unknown fields are ignored by serde, so we only
//! declare what we actually use. Each normalized type (no `Raw` suffix) is
//! what we persist to `defillama_cache` and serve over `/v1/defillama/*`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Tag every persisted/served record with this so no consumer can mistake
/// it for our own primary on-chain-derived data.
pub const SOURCE: &str = "defillama";

// ─── 3. Solana chain TVL — GET /v2/historicalChainTvl/solana (free) ─────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ChainTvlPoint {
    /// Unix seconds.
    pub date: i64,
    pub tvl: f64,
}

// ─── 4. Stablecoins — GET stablecoins.llama.fi/stablecoins (free) ───────────

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct StablecoinsResponseRaw {
    #[serde(rename = "peggedAssets")]
    pub pegged_assets: Vec<StablecoinRaw>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct StablecoinRaw {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub circulating: PeggedAmountRaw,
    #[serde(rename = "chainCirculating", default)]
    pub chain_circulating: HashMap<String, ChainCirculatingEntryRaw>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct PeggedAmountRaw {
    #[serde(rename = "peggedUSD")]
    pub pegged_usd: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ChainCirculatingEntryRaw {
    pub current: PeggedAmountRaw,
}

/// Normalized: a stablecoin that DeFiLlama reports as circulating on Solana.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolanaStablecoin {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub total_circulating_usd: f64,
    pub solana_circulating_usd: f64,
}

// ─── 5. Token prices — GET coins.llama.fi/prices/current/{coins} (free) ─────

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CoinsPriceResponseRaw {
    pub coins: HashMap<String, CoinPriceRaw>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CoinPriceRaw {
    pub symbol: String,
    pub price: f64,
    /// Unix seconds — when the underlying price was observed, per DeFiLlama.
    pub timestamp: i64,
}

/// Normalized on-demand price, cached 5 minutes by [`crate::defillama::DefiLlamaClient`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPrice {
    pub mint: String,
    pub symbol: String,
    pub price_usd: f64,
    /// When DeFiLlama's upstream price source last updated (their `timestamp`).
    pub source_timestamp: DateTime<Utc>,
    /// When we fetched it.
    pub fetched_at: DateTime<Utc>,
}

// ─── 6. Protocols — GET /protocols (free) ────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ProtocolRaw {
    pub name: String,
    pub slug: Option<String>,
    pub tvl: Option<f64>,
    pub category: Option<String>,
}

/// Normalized: the real DeFiLlama TVL for one of our tracked bridges' own
/// protocol entry, matched by a verified slug (see
/// `crate::defillama::client::TRACKED_BRIDGE_SLUGS`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeProtocolTvl {
    pub bridge_id: String,
    pub defillama_slug: String,
    pub defillama_name: String,
    pub category: Option<String>,
    pub tvl_usd: f64,
}

// ─── 8/9. DEX volume & fees overview — GET /overview/{dexs,fees}/solana (free)

/// Both `/overview/dexs/{chain}` and `/overview/fees/{chain}` share this
/// summary shape at the top level (plus large chart/protocol arrays we
/// don't keep — unknown fields are ignored by serde).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VolumeSummary {
    pub total24h: Option<f64>,
    pub total48hto24h: Option<f64>,
    pub total7d: Option<f64>,
    pub total30d: Option<f64>,
    pub change_1d: Option<f64>,
    pub change_7d: Option<f64>,
}

// ─── 1/2/7. Pro-only: bridges list, bridge volume, oracles TVS ──────────────
// Shapes below are per DeFiLlama's own published docs (api-docs.defillama.com,
// confirmed 2026-07-22) since these are behind a $300/mo Pro key we don't
// have — they are NOT verified against a live response. If a key is added,
// verify these against a real call before trusting the parse.

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct BridgesListResponseRaw {
    pub bridges: Vec<BridgeListEntryRaw>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct BridgeListEntryRaw {
    pub id: i64,
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "bridgeDbName")]
    pub bridge_db_name: Option<String>,
    #[serde(default)]
    pub chains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeListEntry {
    pub defillama_id: i64,
    pub display_name: String,
    pub bridge_db_name: String,
    pub chains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeVolumePoint {
    pub date: i64,
    pub deposit_usd: Option<f64>,
    pub withdraw_usd: Option<f64>,
}
