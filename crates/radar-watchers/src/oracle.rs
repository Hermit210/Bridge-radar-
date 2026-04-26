//! Oracle staleness watcher.
//!
//! For Pyth feeds bridges depend on (price feeds for fee / solvency checks),
//! poll the publish time and emit `oracle_stale` when `now - last_publish`
//! exceeds the configured threshold.

use anyhow::Result;
use chrono::{DateTime, Utc};
use radar_core::event::{BridgeEvent, BridgeEventPayload};
use radar_core::pricing::{feeds, PythHermesClient};
use radar_core::storage::SqliteStorage;
use radar_core::Storage;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(60);
/// Threshold before a feed is "stale" — Pyth publishes every ~400ms in normal
/// operation, so anything beyond 60 seconds is genuinely abnormal.
const STALE_THRESHOLD_SECS: i64 = 60;

pub async fn run(storage: Arc<SqliteStorage>) -> Result<()> {
    let mut tick = interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let client = PythHermesClient::new().with_ttl(Duration::from_secs(5));

    loop {
        tick.tick().await;
        for (bridge_id, feed_id) in watched_feeds() {
            match client.price(feed_id).await {
                Ok(p) => {
                    let age = (Utc::now() - p.fetched_at).num_seconds();
                    if age > STALE_THRESHOLD_SECS {
                        emit(&storage, bridge_id, feed_id, p.fetched_at, age).await;
                    } else {
                        debug!(bridge = %bridge_id, feed = %feed_id, age_secs = age, "fresh");
                    }
                }
                Err(e) => warn!(bridge = %bridge_id, feed = %feed_id, error = %e, "oracle fetch"),
            }
        }
    }
}

async fn emit(
    storage: &Arc<SqliteStorage>,
    bridge_id: &str,
    feed_id: &str,
    last_update: DateTime<Utc>,
    age_secs: i64,
) {
    let evt = BridgeEvent {
        id: Uuid::new_v4(),
        bridge_id: bridge_id.into(),
        event_time: Utc::now(),
        payload: BridgeEventPayload::OracleStale {
            feed: feed_id.into(),
            last_update,
        },
    };
    match storage.insert_event(&evt).await {
        Ok(()) => info!(bridge = %bridge_id, feed = %feed_id, age_secs, "oracle_stale emitted"),
        Err(e) => warn!(bridge = %bridge_id, error = %e, "persist oracle_stale"),
    }
}

/// (bridge_id, pyth_feed_id) — bridges whose solvency / fee path depends on
/// the named Pyth feed.
fn watched_feeds() -> &'static [(&'static str, &'static str)] {
    &[
        ("wormhole", feeds::SOL),
        ("wormhole", feeds::ETH),
        ("portal", feeds::SOL),
        ("debridge", feeds::ETH),
        ("layerzero", feeds::ETH),
        ("mayan", feeds::SOL),
    ]
}
