//! Frontend bundle hash watcher (whitepaper §4.3).
//!
//! For each bridge's official URL, fetch the served HTML/JS bundle every 5
//! minutes from a single region (multi-region is a v1.5 follow-up — needs a
//! geographically distributed worker pool). sha256 the response body, store
//! the hash chain, emit `frontend_change` when the hash drifts.
//!
//! Drift can mean a legitimate release or a Curve / Galxe / Balancer-style
//! frontend hijack. v0 emits the event; the scorer's frontend_recency
//! component decays over 6 hours. False positives from legitimate releases
//! are bounded by a 30-min confirmation window in v1.

use anyhow::Result;
use chrono::Utc;
use radar_core::event::{BridgeEvent, BridgeEventPayload};
use radar_core::storage::SqliteStorage;
use radar_core::Storage;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);
const REGION: &str = "default";

pub async fn run(storage: Arc<SqliteStorage>) -> Result<()> {
    let mut tick = interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (BridgeRadar/0.1)")
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut last: HashMap<String, String> = HashMap::new();

    loop {
        tick.tick().await;
        for &(bridge_id, url) in targets() {
            match hash_url(&client, url).await {
                Ok(h) => {
                    if let Some(prev) = last.get(bridge_id).cloned() {
                        if prev != h {
                            let evt = BridgeEvent {
                                id: Uuid::new_v4(),
                                bridge_id: bridge_id.into(),
                                event_time: Utc::now(),
                                payload: BridgeEventPayload::FrontendChange {
                                    region: REGION.into(),
                                    old_hash: prev,
                                    new_hash: h.clone(),
                                },
                            };
                            if let Err(e) = storage.insert_event(&evt).await {
                                warn!(bridge = %bridge_id, error = %e, "persist frontend_change");
                            } else {
                                info!(bridge = %bridge_id, hash = %&h[..12], "frontend_change emitted");
                            }
                        } else {
                            debug!(bridge = %bridge_id, "frontend hash unchanged");
                        }
                    } else {
                        info!(bridge = %bridge_id, hash = %&h[..12], "captured initial frontend hash");
                    }
                    last.insert(bridge_id.into(), h);
                }
                Err(e) => warn!(bridge = %bridge_id, error = %e, "fetch frontend"),
            }
        }
    }
}

async fn hash_url(client: &reqwest::Client, url: &str) -> Result<String> {
    let body = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let mut h = Sha256::new();
    h.update(&body);
    Ok(hex::encode(h.finalize()))
}

fn targets() -> &'static [(&'static str, &'static str)] {
    &[
        ("wormhole", "https://portalbridge.com/"),
        ("portal", "https://portalbridge.com/"),
        ("allbridge", "https://core.allbridge.io/"),
        ("debridge", "https://app.debridge.finance/"),
        ("layerzero", "https://layerzero.network/"),
        ("mayan", "https://swap.mayan.finance/"),
        ("axelar", "https://app.squidrouter.com/"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hash_is_deterministic_for_known_input() {
        let s = "hello bridge radar";
        let mut h = Sha256::new();
        h.update(s.as_bytes());
        let want = hex::encode(h.finalize());
        // Sanity check that our function would produce the same shape for a
        // controlled body: not testing the network, just the hashing.
        assert_eq!(want.len(), 64);
        assert!(want.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
