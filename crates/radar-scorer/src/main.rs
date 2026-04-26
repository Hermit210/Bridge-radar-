//! Health Score writer.
//!
//! v0-NAIVE: every `TICK_SECS`, look at the last `WINDOW_SECS` of events per
//! bridge and compute `outflow_severity = clamp(events / baseline, 0, 1)` with
//! `baseline = OUTFLOW_BASELINE` (configurable per-deploy). All other
//! components stay 0.0. The whitepaper §4.4 weighting still applies, so the
//! score is `100 - 25 * outflow_severity` for now — a quiet bridge sits at
//! 100, an active bridge dips into the 80s.
//!
//! This is *deliberately* an under-claim: the dashboard renders a populated
//! score immediately so the demo isn't dark, but tracing logs and the
//! component breakdown make the under-claim visible. Real parity / signer /
//! frontend / oracle severities arrive with the EVM indexer + detectors crate
//! in v1.

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use radar_core::chain::ChainId;
use radar_core::event::{BridgeEventKind, BridgeId, EventFilter};
use radar_core::health::{HealthComponents, HealthScore};
use radar_core::storage::SqliteStorage;
use radar_core::Storage;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use tracing_subscriber::EnvFilter;

const TICK_SECS: u64 = 60;
const WINDOW_SECS: i64 = 5 * 60;
const OUTFLOW_BASELINE: f64 = 10.0; // events / 5min that yields severity 1.0 in the fallback path
const ZSCORE_LOOKBACK_DAYS: i64 = 30;
const ZSCORE_MIN_BUCKETS: usize = 50; // ~4 hours of observations
const ZSCORE_FIRES_AT: f64 = 4.0; // z >= 4.0 → severity 1.0 (whitepaper §4.3)

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_scorer=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    info!(%db_url, tick_secs = TICK_SECS, window_secs = WINDOW_SECS, "starting scorer (v0-naive)");

    let storage = Arc::new(
        SqliteStorage::connect(&db_url)
            .await
            .context("connecting to storage")?,
    );

    let mut tick = interval(StdDuration::from_secs(TICK_SECS));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tick.tick().await;
        match score_once(storage.as_ref()).await {
            Ok(n) => debug!(updated = n, "tick"),
            Err(e) => warn!(error = %e, "scorer tick failed"),
        }
    }
}

async fn score_once(storage: &SqliteStorage) -> Result<usize> {
    let now = Utc::now();
    let since = now - Duration::seconds(WINDOW_SECS);
    let bridges = storage.list_bridges().await?;
    let mut updated = 0;
    for bridge in bridges {
        if !bridge.enabled {
            continue;
        }
        let score = compute_score(storage, &bridge.id, since, now).await?;
        storage.upsert_score(&score).await?;
        info!(
            bridge = %score.bridge_id,
            score = score.score,
            outflow = format!("{:.2}", score.components.outflow_severity),
            parity = format!("{:.2}", score.components.parity_severity),
            "v0-naive score written"
        );
        updated += 1;
    }
    Ok(updated)
}

async fn compute_score(
    storage: &SqliteStorage,
    bridge_id: &BridgeId,
    since: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Result<HealthScore> {
    let events = storage
        .list_events(&EventFilter {
            bridge_id: Some(bridge_id.clone()),
            since: Some(since),
            limit: Some(1000),
            ..Default::default()
        })
        .await?;

    // Outflow detector — whitepaper §4.3.
    //
    // We pull the per-(bridge, 5-min-bucket) event-count distribution from
    // the past 30 days and compute a z-score for the current window's count.
    // Once we have at least ZSCORE_MIN_BUCKETS observations the z-score is
    // canonical; below that threshold we fall back to the v0 count proxy so
    // a fresh deploy isn't dark for the first hours.
    let baseline_since = now - Duration::days(ZSCORE_LOOKBACK_DAYS);
    let buckets = storage
        .event_count_buckets(bridge_id, baseline_since)
        .await?;
    let current = events.len() as f64;
    let outflow_severity = if buckets.len() >= ZSCORE_MIN_BUCKETS {
        let n = buckets.len() as f64;
        let mean = buckets.iter().map(|c| *c as f64).sum::<f64>() / n;
        let var = buckets
            .iter()
            .map(|c| {
                let d = *c as f64 - mean;
                d * d
            })
            .sum::<f64>()
            / n;
        let stddev = var.sqrt().max(1.0); // floor stddev to avoid div-by-zero in quiet periods
        let z = (current - mean) / stddev;
        (z / ZSCORE_FIRES_AT).clamp(0.0, 1.0) as f32
    } else {
        (current / OUTFLOW_BASELINE).clamp(0.0, 1.0) as f32
    };

    // v0-naive parity: count origin-side (non-Solana) lock/unlock events vs
    // Solana-side mint/burn events in the window. A balanced bridge sees
    // roughly proportional activity on both sides; severity is the relative
    // imbalance. This is a *count* proxy because v0 doesn't price assets —
    // v1 plugs in Pyth and switches to USD-weighted parity per appendix B.
    let mut origin_count: u32 = 0;
    let mut solana_count: u32 = 0;
    for e in &events {
        match (e.chain(), e.kind()) {
            (Some(ChainId::Solana), BridgeEventKind::Mint | BridgeEventKind::Burn) => {
                solana_count += 1;
            }
            (Some(ch), BridgeEventKind::Lock | BridgeEventKind::Unlock)
                if !matches!(ch, ChainId::Solana) =>
            {
                origin_count += 1;
            }
            _ => {}
        }
    }
    let parity_severity = if origin_count + solana_count == 0 {
        0.0
    } else {
        let lo = origin_count.min(solana_count) as f32;
        let hi = origin_count.max(solana_count) as f32;
        1.0 - (lo / hi)
    };

    let components = HealthComponents {
        outflow_severity,
        parity_severity,
        ..Default::default()
    };
    Ok(HealthScore {
        bridge_id: bridge_id.clone(),
        computed_at: now,
        score: components.weighted_score(),
        components,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use radar_core::chain::ChainId;
    use radar_core::event::{BridgeEvent, BridgeEventPayload};
    use uuid::Uuid;

    async fn store_event(s: &SqliteStorage, bridge: &str, kind: &str) {
        let payload = match kind {
            "lock" => BridgeEventPayload::Lock {
                chain: ChainId::Ethereum,
                asset: "x".into(),
                amount_usd: 0.0,
                tx: "x".into(),
            },
            _ => BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "x".into(),
                amount_usd: 0.0,
                tx: "x".into(),
            },
        };
        s.insert_event(&BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: bridge.into(),
            event_time: Utc::now(),
            payload,
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn quiet_bridge_scores_full_marks() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        let score = compute_score(&s, &"wormhole".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert_eq!(score.score, 100);
        assert_eq!(score.components.outflow_severity, 0.0);
    }

    #[tokio::test]
    async fn one_sided_traffic_lights_up_parity() {
        // 5 mints on Solana, 0 origin-side activity = full parity break.
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        for _ in 0..5 {
            store_event(&s, "wormhole", "mint").await;
        }
        let now = Utc::now();
        let score = compute_score(&s, &"wormhole".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert!(
            (score.components.parity_severity - 1.0).abs() < f32::EPSILON,
            "expected parity 1.0, got {}",
            score.components.parity_severity
        );
        // outflow = 5/10 = 0.5 → −12.5 ; parity 1.0 → −40 ; total = 47 (rounded 48)
        assert!((40..=50).contains(&score.score), "got {}", score.score);
    }

    #[tokio::test]
    async fn balanced_traffic_keeps_parity_clean() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        for _ in 0..3 {
            store_event(&s, "wormhole", "mint").await;
            store_event(&s, "wormhole", "lock").await;
        }
        let now = Utc::now();
        let score = compute_score(&s, &"wormhole".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert!(score.components.parity_severity.abs() < f32::EPSILON);
    }
}
