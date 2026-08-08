//! Health Score writer.
//!
//! Every `TICK_SECS`, look at the last `WINDOW_SECS` of events per bridge and
//! compute the whitepaper §4.4 weighted composite:
//!   - `outflow_severity`: z-score of outflow events vs 30-day baseline.
//!   - `parity_severity`: count-based lock/mint imbalance proxy (v0; v1
//!     switches to USD-weighted parity per appendix B once assets are priced).
//!   - `signer_recency` / `frontend_recency` / `oracle_staleness`: recency of
//!     the most recent `signer_change` / `frontend_change` / `oracle_stale`
//!     event `radar-watchers` recorded for that bridge, linearly decayed to 0
//!     over each detector's window (24h / 6h / 5min respectively — see
//!     `recency_severity`). These three detectors already run and persist
//!     real events; this is purely reading them back into the score, not new
//!     detection.

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use radar_core::chain::ChainId;
use radar_core::event::{BridgeEventKind, BridgeId, EventFilter};
use radar_core::health::{HealthComponents, HealthScore};
use radar_core::storage::connect_any;
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

// Whitepaper §4.4: "signer_change_recency (0..1, decays over 24h)" and
// "frontend_drift_recency (0..1, decays over 6h)" — explicit windows.
const SIGNER_RECENCY_WINDOW_HOURS: i64 = 24;
const FRONTEND_RECENCY_WINDOW_HOURS: i64 = 6;
// The whitepaper doesn't give oracle_staleness an explicit decay window (it
// isn't framed as a "recency" component like the other two). Unlike
// signer_change/frontend_change — which are edge-triggered, one event per
// real change — radar-watchers' oracle loop (oracle.rs) is level-triggered:
// it re-emits `oracle_stale` on every 60s poll for as long as the feed stays
// stale. So "most recent event's age" is naturally ~0 while a feed is
// actually stale right now, and decays away once it recovers and polls stop
// firing. 5 minutes comfortably survives one skipped tick
// (`MissedTickBehavior::Skip`) while still tracking "stale right now" rather
// than "had an incident recently."
const ORACLE_STALENESS_WINDOW_MINUTES: i64 = 5;

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

    let storage: Arc<dyn Storage> =
        Arc::from(connect_any(&db_url).await.context("connecting to storage")?);

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

async fn score_once(storage: &dyn Storage) -> Result<usize> {
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
            signer = format!("{:.2}", score.components.signer_recency),
            frontend = format!("{:.2}", score.components.frontend_recency),
            oracle = format!("{:.2}", score.components.oracle_staleness),
            "score written"
        );
        updated += 1;
    }
    Ok(updated)
}

async fn compute_score(
    storage: &dyn Storage,
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

    let signer_recency = recency_severity(
        storage,
        bridge_id,
        BridgeEventKind::SignerChange,
        Duration::hours(SIGNER_RECENCY_WINDOW_HOURS),
        now,
    )
    .await?;
    let frontend_recency = recency_severity(
        storage,
        bridge_id,
        BridgeEventKind::FrontendChange,
        Duration::hours(FRONTEND_RECENCY_WINDOW_HOURS),
        now,
    )
    .await?;
    let oracle_staleness = recency_severity(
        storage,
        bridge_id,
        BridgeEventKind::OracleStale,
        Duration::minutes(ORACLE_STALENESS_WINDOW_MINUTES),
        now,
    )
    .await?;

    let components = HealthComponents {
        outflow_severity,
        parity_severity,
        signer_recency,
        frontend_recency,
        oracle_staleness,
    };
    Ok(HealthScore {
        bridge_id: bridge_id.clone(),
        computed_at: now,
        score: components.weighted_score(),
        components,
    })
}

/// Severity from how recently the most recent real event of `kind` landed
/// for this bridge — linear decay from 1.0 at the moment it happened to 0.0
/// at `window` out, 0.0 with no such event in the window at all. Never
/// interpolates or predicts; only reads real `bridge_events` rows already
/// written by `radar-watchers`.
async fn recency_severity(
    storage: &dyn Storage,
    bridge_id: &BridgeId,
    kind: BridgeEventKind,
    window: Duration,
    now: DateTime<Utc>,
) -> Result<f32> {
    let events = storage
        .list_events(&EventFilter {
            bridge_id: Some(bridge_id.clone()),
            kind: Some(kind),
            since: Some(now - window),
            limit: Some(1),
            ..Default::default()
        })
        .await?;
    let Some(latest) = events.first() else {
        return Ok(0.0);
    };
    let age_secs = (now - latest.event_time).num_seconds().max(0) as f64;
    let window_secs = window.num_seconds().max(1) as f64;
    Ok((1.0 - age_secs / window_secs).clamp(0.0, 1.0) as f32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use radar_core::chain::ChainId;
    use radar_core::event::{BridgeEvent, BridgeEventPayload};
    use radar_core::storage::SqliteStorage;
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
        assert_eq!(score.components.signer_recency, 0.0);
        assert_eq!(score.components.frontend_recency, 0.0);
        assert_eq!(score.components.oracle_staleness, 0.0);
    }

    async fn store_event_at(
        s: &SqliteStorage,
        bridge: &str,
        payload: BridgeEventPayload,
        event_time: DateTime<Utc>,
    ) {
        s.insert_event(&BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: bridge.into(),
            event_time,
            payload,
        })
        .await
        .unwrap();
    }

    fn signer_change_payload() -> BridgeEventPayload {
        BridgeEventPayload::SignerChange {
            before: vec!["guardian-01".into()],
            after: vec!["guardian-02".into()],
            tx: "set:19+1/-1".into(),
        }
    }

    fn frontend_change_payload() -> BridgeEventPayload {
        BridgeEventPayload::FrontendChange {
            region: "default".into(),
            old_hash: "aaaa".into(),
            new_hash: "bbbb".into(),
        }
    }

    fn oracle_stale_payload(now: DateTime<Utc>) -> BridgeEventPayload {
        BridgeEventPayload::OracleStale {
            feed: "SOL/USD".into(),
            last_update: now - Duration::seconds(90),
        }
    }

    /// A real, already-recorded signer_change event 1 hour old — well inside
    /// the 24h decay window — must both populate signer_recency and pull the
    /// score down from a perfect 100.
    #[tokio::test]
    async fn recent_signer_change_moves_score_down() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        store_event_at(
            &s,
            "wormhole",
            signer_change_payload(),
            now - Duration::hours(1),
        )
        .await;
        let score = compute_score(&s, &"wormhole".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert!(
            score.components.signer_recency > 0.9,
            "1h-old event in a 24h window should be near-full severity, got {}",
            score.components.signer_recency
        );
        assert!(
            score.score < 100,
            "score should drop below 100, got {}",
            score.score
        );
        // 15 * ~0.958 ≈ 14.4 → expect roughly 85-86
        assert!((80..=90).contains(&score.score), "got {}", score.score);
    }

    /// A signer_change event older than the 24h window must not affect the
    /// score at all — recency decays fully to 0, not partially.
    #[tokio::test]
    async fn old_signer_change_does_not_affect_score() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        store_event_at(
            &s,
            "wormhole",
            signer_change_payload(),
            now - Duration::hours(25),
        )
        .await;
        let score = compute_score(&s, &"wormhole".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert_eq!(score.components.signer_recency, 0.0);
        assert_eq!(score.score, 100);
    }

    /// Same shape as the signer_change test, but for frontend_change and its
    /// 6h window.
    #[tokio::test]
    async fn recent_frontend_change_moves_score_down() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        store_event_at(
            &s,
            "portal",
            frontend_change_payload(),
            now - Duration::hours(1),
        )
        .await;
        let score = compute_score(&s, &"portal".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert!(
            score.components.frontend_recency > 0.7,
            "1h-old event in a 6h window should be well above zero, got {}",
            score.components.frontend_recency
        );
        assert!(
            score.score < 100,
            "score should drop below 100, got {}",
            score.score
        );
    }

    #[tokio::test]
    async fn old_frontend_change_does_not_affect_score() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        store_event_at(
            &s,
            "portal",
            frontend_change_payload(),
            now - Duration::hours(7),
        )
        .await;
        let score = compute_score(&s, &"portal".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert_eq!(score.components.frontend_recency, 0.0);
        assert_eq!(score.score, 100);
    }

    /// oracle_stale is level-triggered (radar-watchers re-emits it every poll
    /// while a feed stays stale) so a fresh event should read as ~full
    /// severity within its short 5-minute window.
    #[tokio::test]
    async fn recent_oracle_stale_moves_score_down() {
        let s = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let now = Utc::now();
        store_event_at(
            &s,
            "mayan",
            oracle_stale_payload(now),
            now - Duration::seconds(30),
        )
        .await;
        let score = compute_score(&s, &"mayan".to_string(), now - Duration::minutes(5), now)
            .await
            .unwrap();
        assert!(
            score.components.oracle_staleness > 0.8,
            "30s-old event in a 5min window should be near-full severity, got {}",
            score.components.oracle_staleness
        );
        assert!(
            score.score < 100,
            "score should drop below 100, got {}",
            score.score
        );
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
