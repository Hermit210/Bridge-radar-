//! DeFiLlama Solana data layer sync — fetches all nine data categories on
//! independent schedules and caches results (with `fetched_at` timestamps)
//! into the shared `defillama_cache` table. Strictly a secondary,
//! cross-verification data source; never our own detection input.
//!
//! Three categories (bridges list, bridge volume, oracles TVS) require a
//! DeFiLlama Pro API key ($300/mo — see `DefiLlamaError::ProKeyRequired`).
//! With no `DEFILLAMA_API_KEY` set, each still runs on schedule but writes
//! an honest `{"available": false, "reason": "..."}` marker instead of
//! fake/fallback data — never silently skipped, never fabricated.
//!
//! Each job is an independent tokio task so one category's failure (rate
//! limit, timeout, upstream schema drift) never blocks the others.

use chrono::Utc;
use radar_core::defillama::{DefiLlamaClient, DefiLlamaError, TRACKED_BRIDGE_SLUGS};
use radar_core::storage::{connect_any, Storage};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

const KEY_SOLANA: &str = "solana";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_defillama=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    let storage: Arc<dyn Storage> = Arc::from(connect_any(&db_url).await?);
    let client = Arc::new(DefiLlamaClient::new());

    info!(
        pro_key_configured = client.has_pro_key(),
        "starting radar-defillama sync"
    );
    if !client.has_pro_key() {
        warn!(
            "DEFILLAMA_API_KEY not set — bridges list, bridge volume, and oracles TVS \
             will report honest 'unavailable' status, not fake data"
        );
    }

    let jobs: Vec<tokio::task::JoinHandle<()>> = vec![
        tokio::spawn(run_bridges_list(storage.clone(), client.clone())),
        tokio::spawn(run_bridge_volume(storage.clone(), client.clone())),
        tokio::spawn(run_chain_tvl(storage.clone(), client.clone())),
        tokio::spawn(run_stablecoins(storage.clone(), client.clone())),
        tokio::spawn(run_protocols(storage.clone(), client.clone())),
        tokio::spawn(run_oracles(storage.clone(), client.clone())),
        tokio::spawn(run_dex_volume(storage.clone(), client.clone())),
        tokio::spawn(run_fees(storage.clone(), client.clone())),
    ];

    futures::future::join_all(jobs).await;
    Ok(())
}

async fn store_unavailable(storage: &Arc<dyn Storage>, category: &str, err: &DefiLlamaError) {
    let payload = json!({
        "available": false,
        "reason": err.to_string(),
    });
    if let Err(e) = storage
        .defillama_upsert(category, KEY_SOLANA, &payload, Utc::now())
        .await
    {
        warn!(category, error = %e, "persist defillama unavailable marker");
    }
}

/// 1. Bridges list — Pro-only. No fixed cadence given in spec; refreshed
/// hourly since the bridge roster changes rarely.
async fn run_bridges_list(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_bridges_list().await {
            Ok(bridges) => {
                let payload = json!({ "available": true, "bridges": bridges });
                if let Err(e) = storage
                    .defillama_upsert("bridges", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist bridges list");
                } else {
                    info!(count = bridges_len(&payload), "bridges list synced");
                }
            }
            Err(e) => {
                warn!(error = %e, "fetch bridges list");
                store_unavailable(&storage, "bridges", &e).await;
            }
        }
    }
}

fn bridges_len(payload: &serde_json::Value) -> usize {
    payload
        .get("bridges")
        .and_then(|b| b.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

/// 2. Bridge daily volume for Solana — Pro-only. Spec: refresh every 15 min.
async fn run_bridge_volume(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(15 * 60));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_bridge_volume_solana().await {
            Ok(points) => {
                let payload = json!({ "available": true, "points": points });
                if let Err(e) = storage
                    .defillama_upsert("bridge_volume", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist bridge volume");
                } else {
                    info!(points = points_len(&payload), "bridge volume synced");
                }
            }
            Err(e) => {
                warn!(error = %e, "fetch bridge volume");
                store_unavailable(&storage, "bridge_volume", &e).await;
            }
        }
    }
}

fn points_len(payload: &serde_json::Value) -> usize {
    payload
        .get("points")
        .and_then(|b| b.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

/// 3. Solana chain TVL — free. Spec: refresh hourly.
async fn run_chain_tvl(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_chain_tvl_solana().await {
            Ok(points) => {
                let payload = json!({ "points": points });
                if let Err(e) = storage
                    .defillama_upsert("chain_tvl", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist chain tvl");
                } else {
                    info!(points = points.len(), "chain tvl synced");
                }
            }
            Err(e) => warn!(error = %e, "fetch chain tvl"),
        }
    }
}

/// 4. Stablecoins on Solana — free. Spec: refresh every 30 min. One row per
/// stablecoin symbol so the API/parity-check can look one up directly.
async fn run_stablecoins(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(30 * 60));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_stablecoins_solana().await {
            Ok(coins) => {
                let now = Utc::now();
                let mut ok = 0usize;
                for coin in &coins {
                    let payload = match serde_json::to_value(coin) {
                        Ok(v) => v,
                        Err(e) => {
                            warn!(error = %e, "serialize stablecoin");
                            continue;
                        }
                    };
                    match storage
                        .defillama_upsert("stablecoins", &coin.symbol, &payload, now)
                        .await
                    {
                        Ok(()) => ok += 1,
                        Err(e) => warn!(symbol = %coin.symbol, error = %e, "persist stablecoin"),
                    }
                }
                info!(count = ok, "stablecoins synced");
            }
            Err(e) => warn!(error = %e, "fetch stablecoins"),
        }
    }
}

/// 6. Protocol TVL for every tracked bridge with a verified DeFiLlama slug —
/// free. No fixed cadence given in spec; refreshed hourly.
async fn run_protocols(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_tracked_bridge_protocol_tvls().await {
            Ok(entries) => {
                let now = Utc::now();
                let found: std::collections::HashSet<&str> =
                    entries.iter().map(|e| e.bridge_id.as_str()).collect();
                let mut ok = 0usize;
                for entry in &entries {
                    let payload = match serde_json::to_value(entry) {
                        Ok(v) => v,
                        Err(e) => {
                            warn!(error = %e, "serialize protocol tvl");
                            continue;
                        }
                    };
                    match storage
                        .defillama_upsert("protocols", &entry.bridge_id, &payload, now)
                        .await
                    {
                        Ok(()) => ok += 1,
                        Err(e) => warn!(bridge = %entry.bridge_id, error = %e, "persist protocol tvl"),
                    }
                }
                for (bridge_id, slug) in TRACKED_BRIDGE_SLUGS {
                    if !found.contains(bridge_id) {
                        warn!(bridge = %bridge_id, slug = %slug, "no protocol TVL match in DeFiLlama /protocols response");
                    }
                }
                info!(count = ok, "protocol TVLs synced");
            }
            Err(e) => warn!(error = %e, "fetch protocols"),
        }
    }
}

/// 7. Oracles TVS — Pro-only. Spec: refresh daily.
async fn run_oracles(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(24 * 3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_oracles_tvs().await {
            Ok(raw) => {
                let payload = json!({ "available": true, "data": raw });
                if let Err(e) = storage
                    .defillama_upsert("oracles", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist oracles tvs");
                } else {
                    info!("oracles tvs synced");
                }
            }
            Err(e) => {
                warn!(error = %e, "fetch oracles tvs");
                store_unavailable(&storage, "oracles", &e).await;
            }
        }
    }
}

/// 8. Solana DEX volume — free, context only. Spec: refresh hourly.
async fn run_dex_volume(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_dex_volume_solana().await {
            Ok(summary) => {
                let payload = match serde_json::to_value(&summary) {
                    Ok(v) => v,
                    Err(e) => {
                        warn!(error = %e, "serialize dex volume");
                        continue;
                    }
                };
                if let Err(e) = storage
                    .defillama_upsert("dex_volume", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist dex volume");
                } else {
                    info!(total24h = ?summary.total24h, "dex volume synced");
                }
            }
            Err(e) => warn!(error = %e, "fetch dex volume"),
        }
    }
}

/// 9. Solana fees/revenue — free, context only. Spec: refresh daily.
async fn run_fees(storage: Arc<dyn Storage>, client: Arc<DefiLlamaClient>) {
    let mut tick = interval(Duration::from_secs(24 * 3600));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match client.fetch_fees_solana().await {
            Ok(summary) => {
                let payload = match serde_json::to_value(&summary) {
                    Ok(v) => v,
                    Err(e) => {
                        warn!(error = %e, "serialize fees");
                        continue;
                    }
                };
                if let Err(e) = storage
                    .defillama_upsert("fees", KEY_SOLANA, &payload, Utc::now())
                    .await
                {
                    warn!(error = %e, "persist fees");
                } else {
                    info!(total24h = ?summary.total24h, "fees synced");
                }
            }
            Err(e) => warn!(error = %e, "fetch fees"),
        }
    }
}
