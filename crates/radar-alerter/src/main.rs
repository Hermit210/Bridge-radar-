//! Alerter daemon. Tails the event stream + score history, fans alert-worthy
//! items out to Telegram, Discord, and a generic webhook.
//!
//! Alert classes:
//!   - `signer_change`, `frontend_change`, `oracle_stale` events → always
//!   - any new `bridge_health_score` row whose `score < ALERT_THRESHOLD` and
//!     drops at least `ALERT_DELTA` from the previous score for that bridge
//!
//! State (last seen event rowid + last seen score per bridge) is persisted
//! in-process; restarts pick up at the current head and may miss a tick of
//! events. Production should swap to sqlx LISTEN/NOTIFY on Postgres.

use anyhow::{Context, Result};
use chrono::Utc;
use radar_core::event::BridgeEvent;
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use tracing_subscriber::EnvFilter;

const TICK_SECS: u64 = 5;
const ALERT_THRESHOLD: i64 = 70;
const ALERT_DELTA: i64 = 10;

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

    let pool = pool(&db_url).await.context("connect storage")?;
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;

    let mut last_event_rowid = max_event_rowid(&pool).await?;
    let mut last_score: HashMap<String, i64> = HashMap::new();
    for (b, s) in latest_score_per_bridge(&pool).await? {
        last_score.insert(b, s);
    }

    let mut tick = interval(Duration::from_secs(TICK_SECS));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tick.tick().await;
        // Events
        match new_events(&pool, last_event_rowid).await {
            Ok(rows) => {
                for (rowid, event) in rows {
                    last_event_rowid = last_event_rowid.max(rowid);
                    if alert_worthy_event(&event) {
                        let msg = format_event(&event);
                        debug!(?msg, "event alert");
                        fan_out(&http, &cfg, &msg, payload_for_event(&event)).await;
                    }
                }
            }
            Err(e) => warn!(error = %e, "fetch new events"),
        }
        // Score drops
        match latest_score_per_bridge(&pool).await {
            Ok(scores) => {
                for (bridge_id, score) in scores {
                    let prev = last_score.get(&bridge_id).copied().unwrap_or(100);
                    if score < ALERT_THRESHOLD && (prev - score) >= ALERT_DELTA {
                        let msg = format!(
                            "🚨 {bridge_id}: HealthScore dropped from {prev} → {score} (band: {})",
                            band(score)
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
                                "to": score,
                                "ts": Utc::now().to_rfc3339(),
                            }),
                        )
                        .await;
                    }
                    last_score.insert(bridge_id, score);
                }
            }
            Err(e) => warn!(error = %e, "fetch scores"),
        }
    }
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

async fn pool(db_url: &str) -> Result<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));
    Ok(SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(opts)
        .await?)
}

async fn max_event_rowid(pool: &SqlitePool) -> Result<i64> {
    let r = sqlx::query("SELECT COALESCE(MAX(rowid), 0) AS m FROM bridge_events")
        .fetch_one(pool)
        .await?;
    Ok(r.try_get::<i64, _>("m")?)
}

async fn new_events(pool: &SqlitePool, last_rowid: i64) -> Result<Vec<(i64, BridgeEvent)>> {
    let rows = sqlx::query(
        r#"SELECT rowid, id, event_time, bridge_id, payload
             FROM bridge_events
            WHERE rowid > ?
         ORDER BY rowid ASC LIMIT 200"#,
    )
    .bind(last_rowid)
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let rowid: i64 = row.try_get("rowid")?;
        let id_str: String = row.try_get("id")?;
        let event_time_str: String = row.try_get("event_time")?;
        let bridge_id: String = row.try_get("bridge_id")?;
        let payload_str: String = row.try_get("payload")?;
        let payload = match serde_json::from_str(&payload_str) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let event_time = match chrono::DateTime::parse_from_rfc3339(&event_time_str) {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(_) => continue,
        };
        let id = match uuid::Uuid::parse_str(&id_str) {
            Ok(u) => u,
            Err(_) => continue,
        };
        out.push((
            rowid,
            BridgeEvent {
                id,
                event_time,
                bridge_id,
                payload,
            },
        ));
    }
    Ok(out)
}

async fn latest_score_per_bridge(pool: &SqlitePool) -> Result<Vec<(String, i64)>> {
    let rows = sqlx::query(
        r#"SELECT s.bridge_id, s.score
             FROM bridge_health_scores s
        INNER JOIN (
                 SELECT bridge_id, MAX(computed_at) AS m
                   FROM bridge_health_scores GROUP BY bridge_id
             ) latest ON latest.bridge_id = s.bridge_id AND latest.m = s.computed_at"#,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| (r.get::<String, _>("bridge_id"), r.get::<i64, _>("score")))
        .collect())
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
