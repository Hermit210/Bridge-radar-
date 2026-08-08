//! Alerter daemon. Tails the event stream + score history, fans alert-worthy
//! items out to Telegram, Discord, and a generic webhook.
//!
//! Alert classes:
//!   - `signer_change`, `frontend_change`, `oracle_stale` events → always
//!   - any new `bridge_health_score` row whose `score < ALERT_THRESHOLD` and
//!     drops at least `ALERT_DELTA` from the previous score for that bridge
//!
//! State (last seen event timestamp + last seen score per bridge) is
//! persisted in-process; restarts pick up at the current head and may miss a
//! tick of events. Reads go through the same `Storage` trait every other
//! backend uses (via `connect_any`), so this runs against SQLite or Postgres
//! without a backend-specific code path — no more hand-rolled SQL here.

use anyhow::{Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use radar_core::event::{BridgeEvent, EventFilter};
use radar_core::storage::connect_any;
use radar_core::Storage;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use tracing_subscriber::EnvFilter;

const TICK_SECS: u64 = 5;
const ALERT_THRESHOLD: i64 = 70;
const ALERT_DELTA: i64 = 10;
const EVENT_BATCH_LIMIT: u32 = 200;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_alerter=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    let cfg = SinkConfig::from_env();
    info!(
        telegram = cfg.telegram.is_some(),
        discord = cfg.discord.is_some(),
        webhook = cfg.webhook.is_some(),
        "starting alerter"
    );
    if cfg.is_empty() {
        warn!("no alert sinks configured (TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID, DISCORD_WEBHOOK_URL, ALERT_WEBHOOK_URL); running in dry-run mode");
    }

    let storage: Arc<dyn Storage> =
        Arc::from(connect_any(&db_url).await.context("connect storage")?);
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;

    let mut cursor = initial_cursor(storage.as_ref()).await?;
    let mut last_score: HashMap<String, i64> = HashMap::new();
    for score in storage.latest_scores().await? {
        last_score.insert(score.bridge_id.clone(), score.score as i64);
    }

    let mut tick = interval(Duration::from_secs(TICK_SECS));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tick.tick().await;
        // Events
        match new_events(storage.as_ref(), cursor, EVENT_BATCH_LIMIT).await {
            Ok((events, next_cursor)) => {
                for event in events {
                    if alert_worthy_event(&event) {
                        let msg = format_event(&event);
                        debug!(?msg, "event alert");
                        fan_out(&http, &cfg, &msg, payload_for_event(&event)).await;
                    }
                }
                if let Some(c) = next_cursor {
                    cursor = c;
                }
            }
            Err(e) => warn!(error = %e, "fetch new events"),
        }
        // Score drops
        match storage.latest_scores().await {
            Ok(scores) => {
                for score in scores {
                    let bridge_id = score.bridge_id.clone();
                    let current = score.score as i64;
                    let prev = last_score.get(&bridge_id).copied().unwrap_or(100);
                    if current < ALERT_THRESHOLD && (prev - current) >= ALERT_DELTA {
                        let msg = format!(
                            "🚨 {bridge_id}: HealthScore dropped from {prev} → {current} (band: {})",
                            band(current)
                        );
                        info!(%msg, "score drop alert");
                        fan_out(
                            &http,
                            &cfg,
                            &msg,
                            json!({
                                "kind": "score_drop",
                                "bridge_id": bridge_id,
                                "from": prev,
                                "to": current,
                                "ts": Utc::now().to_rfc3339(),
                            }),
                        )
                        .await;
                    }
                    last_score.insert(bridge_id, current);
                }
            }
            Err(e) => warn!(error = %e, "fetch scores"),
        }
    }
}

/// Where to start tailing from: just past the most recent event that already
/// existed at startup, so a restart doesn't replay the whole history as
/// fresh alerts. Empty store (or storage error deriving no rows) starts at
/// "now".
async fn initial_cursor(storage: &dyn Storage) -> Result<DateTime<Utc>> {
    let latest = storage
        .list_events(&EventFilter {
            limit: Some(1),
            ..Default::default()
        })
        .await?;
    Ok(latest
        .first()
        .map(|e| e.event_time + ChronoDuration::microseconds(1))
        .unwrap_or_else(Utc::now))
}

/// Events strictly after `since`, oldest first, plus the cursor to resume
/// from next tick (one microsecond past the newest event returned, so the
/// next `since` filter — which is inclusive — doesn't re-match it).
async fn new_events(
    storage: &dyn Storage,
    since: DateTime<Utc>,
    limit: u32,
) -> Result<(Vec<BridgeEvent>, Option<DateTime<Utc>>)> {
    let mut rows = storage
        .list_events(&EventFilter {
            since: Some(since),
            limit: Some(limit),
            ..Default::default()
        })
        .await?;
    // Storage impls return event_time DESC; rows[0] is the newest.
    let next_cursor = rows
        .first()
        .map(|e| e.event_time + ChronoDuration::microseconds(1));
    rows.reverse();
    Ok((rows, next_cursor))
}

#[derive(Default, Debug)]
struct SinkConfig {
    telegram: Option<(String, String)>,
    discord: Option<String>,
    webhook: Option<String>,
}

impl SinkConfig {
    fn from_env() -> Self {
        let telegram = match (
            std::env::var("TELEGRAM_BOT_TOKEN").ok(),
            std::env::var("TELEGRAM_CHAT_ID").ok(),
        ) {
            (Some(t), Some(c)) if !t.is_empty() && !c.is_empty() => Some((t, c)),
            _ => None,
        };
        Self {
            telegram,
            discord: std::env::var("DISCORD_WEBHOOK_URL")
                .ok()
                .filter(|s| !s.is_empty()),
            webhook: std::env::var("ALERT_WEBHOOK_URL")
                .ok()
                .filter(|s| !s.is_empty()),
        }
    }
    fn is_empty(&self) -> bool {
        self.telegram.is_none() && self.discord.is_none() && self.webhook.is_none()
    }
}

async fn fan_out(http: &reqwest::Client, cfg: &SinkConfig, msg: &str, payload: Value) {
    if let Some((token, chat)) = &cfg.telegram {
        let url = format!("https://api.telegram.org/bot{token}/sendMessage");
        let body = json!({ "chat_id": chat, "text": msg, "disable_web_page_preview": true });
        if let Err(e) = http.post(&url).json(&body).send().await {
            warn!(error = %e, "telegram send failed");
        }
    }
    if let Some(url) = &cfg.discord {
        let body = json!({ "content": msg });
        if let Err(e) = http.post(url).json(&body).send().await {
            warn!(error = %e, "discord send failed");
        }
    }
    if let Some(url) = &cfg.webhook {
        let body = json!({ "message": msg, "data": payload });
        if let Err(e) = http.post(url).json(&body).send().await {
            warn!(error = %e, "webhook send failed");
        }
    }
}

fn alert_worthy_event(e: &BridgeEvent) -> bool {
    use radar_core::event::BridgeEventKind::*;
    matches!(e.kind(), SignerChange | FrontendChange | OracleStale)
}

fn format_event(e: &BridgeEvent) -> String {
    use radar_core::event::BridgeEventPayload::*;
    match &e.payload {
        SignerChange { before, after, .. } => format!(
            "🔑 {}: signer set changed ({}→{} keys)",
            e.bridge_id,
            before.len(),
            after.len()
        ),
        FrontendChange {
            region, new_hash, ..
        } => format!(
            "🌐 {}: frontend bundle changed in {} (sha256:{}…)",
            e.bridge_id,
            region,
            &new_hash[..12.min(new_hash.len())]
        ),
        OracleStale { feed, .. } => {
            format!("⏰ {}: oracle feed {} is stale", e.bridge_id, feed)
        }
        _ => format!("• {}: {}", e.bridge_id, e.kind().as_str()),
    }
}

fn payload_for_event(e: &BridgeEvent) -> Value {
    serde_json::to_value(e).unwrap_or(json!({}))
}

fn band(score: i64) -> &'static str {
    if score >= 80 {
        "GREEN"
    } else if score >= 50 {
        "YELLOW"
    } else {
        "RED"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn band_thresholds() {
        assert_eq!(band(100), "GREEN");
        assert_eq!(band(80), "GREEN");
        assert_eq!(band(79), "YELLOW");
        assert_eq!(band(50), "YELLOW");
        assert_eq!(band(49), "RED");
    }

    #[test]
    fn worthy_event_classification() {
        use radar_core::event::{BridgeEvent, BridgeEventPayload};
        let e = BridgeEvent {
            id: uuid::Uuid::new_v4(),
            bridge_id: "wormhole".into(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::SignerChange {
                before: vec!["a".into()],
                after: vec!["b".into()],
                tx: "x".into(),
            },
        };
        assert!(alert_worthy_event(&e));
    }
}
