//! HTTP client for DeFiLlama's Solana-relevant data.
//!
//! This is a SECONDARY / cross-verification data layer — external reference
//! context alongside our own on-chain indexing, never a replacement for it.
//! Every normalized type in [`super::types`] is what actually gets persisted
//! to `defillama_cache`; callers should treat all of it as advisory.
//!
//! Twelve data categories, three of which (`bridges list`, `bridge volume`,
//! `oracles TVS`) are behind DeFiLlama's Pro API ($300/mo, confirmed via
//! their own docs on 2026-07-22 and re-confirmed live on 2026-07-23 —
//! `bridges.llama.fi/*` and `api.llama.fi/oracles` return `402 Payment
//! Required` without a key). Those three read `DEFILLAMA_API_KEY` from the
//! environment; with no key set they return [`DefiLlamaError::ProKeyRequired`]
//! immediately — no network call, no fake data, ever.

use super::types::*;
use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

const FREE_BASE: &str = "https://api.llama.fi";
const STABLECOINS_BASE: &str = "https://stablecoins.llama.fi";
const COINS_BASE: &str = "https://coins.llama.fi";
const PRO_BASE: &str = "https://pro-api.llama.fi";

const PRICE_CACHE_TTL_SECS: i64 = 300;

/// Timeout override for free-tier endpoints known to return large payloads
/// (`/protocols`, `yields.llama.fi/pools`). Measured directly via repeated
/// curl on 2026-07-23: 5 back-to-back real requests to yields.llama.fi/pools
/// took 8-30.5s each for the same ~11MB payload — legitimately slow, not an
/// error. The client's default 30s timeout was occasionally clipping the
/// slow end of that range.
const LARGE_PAYLOAD_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub enum DefiLlamaError {
    #[error("defillama http error: {0}")]
    Http(String),
    #[error("defillama returned {status} for {url}")]
    Status { status: u16, url: String },
    #[error("unexpected response shape from {0}: {1}")]
    Shape(String, String),
    #[error(
        "requires a DeFiLlama Pro API key ($300/mo) — set DEFILLAMA_API_KEY in .env; \
         see https://defillama.com/subscription"
    )]
    ProKeyRequired,
}

/// (our bridge id, verified DeFiLlama protocol slug) — hand-verified against
/// a live `/protocols` response on 2026-07-22, not guessed. `wormhole` and
/// `portal` intentionally map to the same slug: DeFiLlama tracks Wormhole's
/// token bridge under a single "Portal" protocol entry, it doesn't have a
/// separate "Wormhole" listing.
pub const TRACKED_BRIDGE_SLUGS: &[(&str, &str)] = &[
    ("wormhole", "portal"),
    ("portal", "portal"),
    ("allbridge", "allbridge-core"),
    ("debridge", "debridge"),
    ("layerzero", "layerzero-v2"),
    ("mayan", "mayan-bridge"),
    ("axelar", "axelar"),
    ("cctp", "circle-cctp"),
    ("hyperlane", "hyperlane"),
    ("atomiq", "atomiq-exchange"),
    ("rhinofi", "rhino.fi"),
    ("orderly", "orderly-bridge"),
];

/// (our id, verified DeFiLlama protocol slug) for shared messaging
/// infrastructure — NOT dedicated bridges. Hand-verified against a live
/// `/protocols` response on 2026-07-23: CCIP's slug is `ccip` (has a real
/// Solana entry in `currentChainTvls`, ~$64.7M at verification time).
/// LayerZero's generic messaging slug is `layerzero-v2` (the same slug
/// `TRACKED_BRIDGE_SLUGS` uses for our own `layerzero` bridge id above — that
/// reuse is intentional per DeFiLlama's own protocol model, not a bug) and
/// currently has no Solana entry in `currentChainTvls` at all.
pub const MESSAGING_PROTOCOL_SLUGS: &[(&str, &str)] = &[("ccip", "ccip"), ("layerzero", "layerzero-v2")];

/// How many Solana yield pools (sorted by APY descending) to keep from
/// `yields.llama.fi/pools`, which returns 2,800+ Solana pools unfiltered.
const YIELDS_TOP_N: usize = 20;

#[derive(Clone)]
pub struct DefiLlamaClient {
    http: reqwest::Client,
    pro_api_key: Option<String>,
    price_cache: Arc<RwLock<HashMap<String, TokenPrice>>>,
}

impl DefiLlamaClient {
    /// Reads `DEFILLAMA_API_KEY` from the environment (absent is fine — the
    /// three Pro-only fetchers just report unavailable).
    pub fn new() -> Self {
        Self::with_pro_key(std::env::var("DEFILLAMA_API_KEY").ok().filter(|k| !k.is_empty()))
    }

    pub fn with_pro_key(pro_api_key: Option<String>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent("bridge-radar/0.1")
                .build()
                .expect("reqwest client builder"),
            pro_api_key,
            price_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn has_pro_key(&self) -> bool {
        self.pro_api_key.is_some()
    }

    // ── 3. Solana chain TVL (free, hourly) ───────────────────────────────
    pub async fn fetch_chain_tvl_solana(&self) -> Result<Vec<ChainTvlPoint>, DefiLlamaError> {
        let url = format!("{FREE_BASE}/v2/historicalChainTvl/solana");
        self.get_json(&url).await
    }

    // ── 4. Stablecoins on Solana (free, 30 min) ──────────────────────────
    pub async fn fetch_stablecoins_solana(&self) -> Result<Vec<SolanaStablecoin>, DefiLlamaError> {
        let url = format!("{STABLECOINS_BASE}/stablecoins");
        let raw: StablecoinsResponseRaw = self.get_json(&url).await?;
        Ok(raw
            .pegged_assets
            .into_iter()
            .filter_map(|a| {
                let solana_usd = a.chain_circulating.get("Solana")?.current.pegged_usd?;
                Some(SolanaStablecoin {
                    id: a.id,
                    name: a.name,
                    symbol: a.symbol,
                    total_circulating_usd: a.circulating.pegged_usd.unwrap_or(0.0),
                    solana_circulating_usd: solana_usd,
                })
            })
            .collect())
    }

    // ── 5. Token price, on-demand, 5-min cache (free) ────────────────────
    //
    // Used as a fallback price source when our primary Pyth oracle check
    // shows staleness — see `radar-watchers/src/oracle.rs`.
    pub async fn fetch_price(&self, solana_mint: &str) -> Result<TokenPrice, DefiLlamaError> {
        {
            let cache = self.price_cache.read().await;
            if let Some(p) = cache.get(solana_mint) {
                if (Utc::now() - p.fetched_at).num_seconds() < PRICE_CACHE_TTL_SECS {
                    return Ok(p.clone());
                }
            }
        }
        let coin_id = format!("solana:{solana_mint}");
        let url = format!("{COINS_BASE}/prices/current/{coin_id}");
        let raw: CoinsPriceResponseRaw = self.get_json(&url).await?;
        let entry = raw.coins.get(&coin_id).ok_or_else(|| {
            DefiLlamaError::Shape(url.clone(), format!("no price entry for {coin_id}"))
        })?;
        let price = TokenPrice {
            mint: solana_mint.to_string(),
            symbol: entry.symbol.clone(),
            price_usd: entry.price,
            source_timestamp: DateTime::from_timestamp(entry.timestamp, 0).unwrap_or_else(Utc::now),
            fetched_at: Utc::now(),
        };
        self.price_cache
            .write()
            .await
            .insert(solana_mint.to_string(), price.clone());
        Ok(price)
    }

    // ── 6. Protocol TVL for every tracked bridge with a verified slug ────
    pub async fn fetch_tracked_bridge_protocol_tvls(
        &self,
    ) -> Result<Vec<BridgeProtocolTvl>, DefiLlamaError> {
        let url = format!("{FREE_BASE}/protocols");
        let raw: Vec<ProtocolRaw> = self
            .get_json_with_timeout(&url, Some(LARGE_PAYLOAD_TIMEOUT))
            .await?;
        let by_slug: HashMap<&str, &ProtocolRaw> = raw
            .iter()
            .filter_map(|p| p.slug.as_deref().map(|s| (s, p)))
            .collect();
        Ok(TRACKED_BRIDGE_SLUGS
            .iter()
            .filter_map(|(bridge_id, slug)| {
                let p = by_slug.get(slug)?;
                Some(BridgeProtocolTvl {
                    bridge_id: bridge_id.to_string(),
                    defillama_slug: slug.to_string(),
                    defillama_name: p.name.clone(),
                    category: p.category.clone(),
                    tvl_usd: p.tvl?,
                })
            })
            .collect())
    }

    // ── 8. Solana DEX volume (free, hourly) ──────────────────────────────
    pub async fn fetch_dex_volume_solana(&self) -> Result<VolumeSummary, DefiLlamaError> {
        let url = format!("{FREE_BASE}/overview/dexs/solana");
        self.get_json(&url).await
    }

    // ── 9. Solana fees/revenue (free, daily) ─────────────────────────────
    pub async fn fetch_fees_solana(&self) -> Result<VolumeSummary, DefiLlamaError> {
        let url = format!("{FREE_BASE}/overview/fees/solana");
        self.get_json(&url).await
    }

    // ── 10. Messaging protocols (CCIP, LayerZero) Solana context (free) ──
    pub async fn fetch_messaging_protocols_solana_context(
        &self,
    ) -> Result<Vec<MessagingProtocolContext>, DefiLlamaError> {
        let list_url = format!("{FREE_BASE}/protocols");
        let list: Vec<ProtocolRaw> = self
            .get_json_with_timeout(&list_url, Some(LARGE_PAYLOAD_TIMEOUT))
            .await?;
        let by_slug: HashMap<&str, &ProtocolRaw> = list
            .iter()
            .filter_map(|p| p.slug.as_deref().map(|s| (s, p)))
            .collect();

        let mut out = Vec::with_capacity(MESSAGING_PROTOCOL_SLUGS.len());
        for (id, slug) in MESSAGING_PROTOCOL_SLUGS {
            let Some(summary) = by_slug.get(slug) else {
                continue;
            };
            let detail_url = format!("{FREE_BASE}/protocol/{slug}");
            let detail: ProtocolChainTvlsRaw = self.get_json(&detail_url).await?;
            out.push(MessagingProtocolContext {
                id: id.to_string(),
                defillama_slug: slug.to_string(),
                defillama_name: summary.name.clone(),
                category: summary.category.clone(),
                total_tvl_usd: summary.tvl,
                solana_tvl_usd: detail.current_chain_tvls.get("Solana").copied(),
            });
        }
        Ok(out)
    }


    // ── 1. Bridges list (Pro-only) ────────────────────────────────────────
    pub async fn fetch_bridges_list(&self) -> Result<Vec<BridgeListEntry>, DefiLlamaError> {
        let url = self.pro_url("/bridges/bridges")?;
        let raw: BridgesListResponseRaw = self.get_json(&url).await?;
        Ok(raw
            .bridges
            .into_iter()
            .map(|b| BridgeListEntry {
                defillama_id: b.id,
                display_name: b.display_name.unwrap_or_else(|| b.name.clone()),
                bridge_db_name: b.bridge_db_name.unwrap_or(b.name),
                chains: b.chains,
            })
            .collect())
    }

    // ── 2. Bridge daily volume for Solana (Pro-only) ─────────────────────
    pub async fn fetch_bridge_volume_solana(&self) -> Result<Vec<BridgeVolumePoint>, DefiLlamaError> {
        let url = self.pro_url("/bridges/bridgevolume/solana")?;
        self.get_json(&url).await
    }

    // ── 7. Oracles TVS (Pro-only) ──────────────────────────────────────────
    // Kept as raw JSON — DeFiLlama's own docs don't publish a field-level
    // schema for this one and we have no key to verify a live shape against.
    pub async fn fetch_oracles_tvs(&self) -> Result<serde_json::Value, DefiLlamaError> {
        let url = self.pro_url("/api/oracles")?;
        self.get_json(&url).await
    }

    // ── 12. Solana yields, top pools by APY (free, dashboard context only) ──
    pub async fn fetch_yields_solana(&self) -> Result<Vec<SolanaYieldPool>, DefiLlamaError> {
        let url = "https://yields.llama.fi/pools".to_string();
        let raw: YieldsPoolsResponseRaw = self
            .get_json_with_timeout(&url, Some(LARGE_PAYLOAD_TIMEOUT))
            .await?;
        let mut pools: Vec<SolanaYieldPool> = raw
            .data
            .into_iter()
            .filter(|p| p.chain == "Solana")
            .map(|p| SolanaYieldPool {
                pool_id: p.pool,
                project: p.project,
                symbol: p.symbol,
                tvl_usd: p.tvl_usd,
                apy: p.apy,
                apy_base: p.apy_base,
                apy_reward: p.apy_reward,
                stablecoin: p.stablecoin.unwrap_or(false),
            })
            .collect();
        pools.sort_by(|a, b| {
            b.apy
                .unwrap_or(f64::NEG_INFINITY)
                .partial_cmp(&a.apy.unwrap_or(f64::NEG_INFINITY))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        pools.truncate(YIELDS_TOP_N);
        Ok(pools)
    }

    fn pro_url(&self, path: &str) -> Result<String, DefiLlamaError> {
        let key = self.pro_api_key.as_ref().ok_or(DefiLlamaError::ProKeyRequired)?;
        Ok(format!("{PRO_BASE}/{key}{path}"))
    }

    async fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T, DefiLlamaError> {
        self.get_json_with_timeout(url, None).await
    }

    /// Like [`Self::get_json`], but lets a caller override the client's
    /// default 30s timeout. Some free DeFiLlama endpoints return multi-MB
    /// payloads (`/protocols` lists thousands of protocols; `yields.llama.fi/
    /// pools` returns 16,000+ pools, ~11MB) that DeFiLlama's free tier can
    /// take 20-30s to fully transfer under load — observed directly via
    /// repeated curl timing (22-30s per request) on 2026-07-23, not a bug in
    /// our request, just a slow/throttled free-tier response. Treating a
    /// legitimately-slow-but-real response as a hard error would mean this
    /// data silently and permanently fails to sync from a machine on a slow
    /// path to DeFiLlama, which is worse than waiting a bit longer for it.
    async fn get_json_with_timeout<T: DeserializeOwned>(
        &self,
        url: &str,
        timeout: Option<Duration>,
    ) -> Result<T, DefiLlamaError> {
        let mut req = self.http.get(url);
        if let Some(t) = timeout {
            req = req.timeout(t);
        }
        let resp = req.send().await.map_err(|e| DefiLlamaError::Http(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(DefiLlamaError::Status {
                status: status.as_u16(),
                url: url.to_string(),
            });
        }
        let text = resp
            .text()
            .await
            .map_err(|e| DefiLlamaError::Http(e.to_string()))?;
        serde_json::from_str(&text).map_err(|e| DefiLlamaError::Shape(url.to_string(), e.to_string()))
    }
}

impl Default for DefiLlamaClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracked_slugs_are_unique_per_bridge() {
        let ids: Vec<&str> = TRACKED_BRIDGE_SLUGS.iter().map(|(id, _)| *id).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(ids.len(), sorted.len(), "duplicate bridge_id in TRACKED_BRIDGE_SLUGS");
    }

    #[test]
    fn messaging_protocol_slugs_are_unique() {
        let ids: Vec<&str> = MESSAGING_PROTOCOL_SLUGS.iter().map(|(id, _)| *id).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(
            ids.len(),
            sorted.len(),
            "duplicate id in MESSAGING_PROTOCOL_SLUGS"
        );
    }

    #[tokio::test]
    async fn no_key_pro_fetch_fails_fast_without_network_call() {
        let client = DefiLlamaClient::with_pro_key(None);
        assert!(!client.has_pro_key());
        let err = client.fetch_bridges_list().await.unwrap_err();
        assert!(matches!(err, DefiLlamaError::ProKeyRequired));
    }
}
