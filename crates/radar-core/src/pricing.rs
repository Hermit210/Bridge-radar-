//! Pyth Hermes price client + in-memory cache.
//!
//! Used by indexers to convert raw token amounts into USD before they hit
//! the storage layer, and by the scorer to USD-weight the parity invariant
//! (whitepaper §4.3).
//!
//! v1 fetches via the public Hermes HTTP API. Switch to a paid Pyth
//! Lazer-style stream by swapping the inner client; the trait surface is
//! unchanged.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Pyth feed IDs for the assets we care about. All canonical mainnet IDs
/// from <https://www.pyth.network/developers/price-feed-ids>.
pub mod feeds {
    pub const USDC: &str = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
    pub const USDT: &str = "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b";
    pub const SOL: &str = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    pub const ETH: &str = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
    pub const BTC: &str = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    pub const BNB: &str = "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
    pub const MATIC: &str = "0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52";
}

/// A simple slug → feed-id registry. New tokens get added here as adapters
/// teach the indexers to recognize them.
pub fn default_registry() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("USDC", feeds::USDC),
        ("USDT", feeds::USDT),
        ("SOL", feeds::SOL),
        ("WSOL", feeds::SOL),
        ("ETH", feeds::ETH),
        ("WETH", feeds::ETH),
        ("BTC", feeds::BTC),
        ("WBTC", feeds::BTC),
        ("BNB", feeds::BNB),
        ("WBNB", feeds::BNB),
        ("MATIC", feeds::MATIC),
    ])
}

#[derive(Debug, Clone)]
pub struct Price {
    pub feed_id: String,
    /// USD price as a plain f64. Pyth prices come with an exponent + conf;
    /// we collapse to f64 because v0 callers don't need confidence intervals.
    pub price_usd: f64,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct PythHermesClient {
    base_url: String,
    http: reqwest::Client,
    cache: Arc<RwLock<HashMap<String, Price>>>,
    ttl: Duration,
}

impl PythHermesClient {
    pub fn new() -> Self {
        Self::with_url("https://hermes.pyth.network".to_string())
    }

    pub fn with_url(base_url: String) -> Self {
        Self {
            base_url,
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .expect("reqwest client builder"),
            cache: Arc::new(RwLock::new(HashMap::new())),
            ttl: Duration::from_secs(30),
        }
    }

    pub fn with_ttl(mut self, ttl: Duration) -> Self {
        self.ttl = ttl;
        self
    }

    /// Returns the cached price for `feed_id` if it's fresher than `ttl`,
    /// otherwise fetches from Hermes and caches.
    pub async fn price(&self, feed_id: &str) -> Result<Price, PriceError> {
        // Read-locked cache check first to avoid the network on hot paths.
        {
            let cache = self.cache.read().await;
            if let Some(p) = cache.get(feed_id) {
                let age = Utc::now() - p.fetched_at;
                if age.num_seconds() < self.ttl.as_secs() as i64 {
                    return Ok(p.clone());
                }
            }
        }
        let fresh = self.fetch(feed_id).await?;
        self.cache
            .write()
            .await
            .insert(feed_id.to_string(), fresh.clone());
        Ok(fresh)
    }

    /// Convert `amount` of `asset_slug` (e.g. "USDC") into USD using the
    /// shipped registry. Returns `None` if the slug isn't priced.
    pub async fn amount_to_usd(&self, asset_slug: &str, amount_native: f64) -> Option<f64> {
        let registry = default_registry();
        let feed_id = registry.get(asset_slug)?;
        let p = self.price(feed_id).await.ok()?;
        Some(amount_native * p.price_usd)
    }

    async fn fetch(&self, feed_id: &str) -> Result<Price, PriceError> {
        let id = feed_id.trim_start_matches("0x");
        let url = format!("{}/v2/updates/price/latest?ids[]={}", self.base_url, id);
        let resp: HermesResponse = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| PriceError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| PriceError::Http(e.to_string()))?
            .json()
            .await
            .map_err(|e| PriceError::Http(e.to_string()))?;
        let parsed = resp
            .parsed
            .ok_or_else(|| PriceError::Missing(feed_id.to_string()))?;
        let item = parsed
            .into_iter()
            .next()
            .ok_or_else(|| PriceError::Missing(feed_id.to_string()))?;
        let raw: f64 = item
            .price
            .price
            .parse::<i64>()
            .map_err(|e| PriceError::Parse(e.to_string()))? as f64;
        let expo = item.price.expo;
        let price_usd = raw * 10f64.powi(expo);
        Ok(Price {
            feed_id: feed_id.to_string(),
            price_usd,
            fetched_at: Utc::now(),
        })
    }
}

impl Default for PythHermesClient {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PriceError {
    #[error("http error: {0}")]
    Http(String),
    #[error("missing feed in response: {0}")]
    Missing(String),
    #[error("parse error: {0}")]
    Parse(String),
}

#[derive(Debug, Deserialize)]
struct HermesResponse {
    parsed: Option<Vec<HermesParsed>>,
}

#[derive(Debug, Deserialize)]
struct HermesParsed {
    price: HermesPriceObj,
}

#[derive(Debug, Deserialize)]
struct HermesPriceObj {
    price: String,
    expo: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_known_assets() {
        let r = default_registry();
        assert!(r.contains_key("USDC"));
        assert!(r.contains_key("WETH"));
        assert_eq!(r.get("WETH"), r.get("ETH"));
    }
}
