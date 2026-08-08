//! Telegram bot command handling — `/start`, `/status`, `/help`.
//!
//! Long-polling (`getUpdates`) rather than a webhook: this process has no
//! public HTTPS endpoint to receive a webhook callback on, and long-polling
//! needs nothing extra (no TLS cert, no reverse proxy, no public port) —
//! just outbound HTTPS, which this binary already does for the alert
//! fan-out. The tradeoff is one extra long-lived HTTP request per poll cycle
//! instead of zero; at Bridge Radar's message volume that's irrelevant.
//!
//! Runs as a second task in the same process as the alert fan-out loop
//! (see `main.rs`) — one bot token, one process, no new service to deploy.

use crate::band;
use anyhow::{Context, Result};
use radar_core::Storage;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, warn};

/// Telegram's own long-poll timeout, seconds. The HTTP client timeout below
/// must exceed this or every poll spuriously "fails" right as Telegram was
/// about to return an empty result.
const POLL_TIMEOUT_SECS: u64 = 30;
const HTTP_TIMEOUT_SECS: u64 = 40;
/// Backoff after a failed getUpdates call (network error, bad token, etc.)
/// so a persistent failure doesn't busy-loop against Telegram's API.
const ERROR_BACKOFF_SECS: u64 = 5;

pub async fn run(token: String, storage: Arc<dyn Storage>) -> Result<()> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()?;
    let base = format!("https://api.telegram.org/bot{token}");

    info!("telegram command polling started (/start, /status, /help)");
    let mut offset: i64 = 0;
    loop {
        match get_updates(&http, &base, offset).await {
            Ok(updates) => {
                for update in &updates {
                    if let Some(id) = update.get("update_id").and_then(Value::as_i64) {
                        offset = offset.max(id + 1);
                    }
                    handle_update(&http, &base, storage.as_ref(), update).await;
                }
            }
            Err(e) => {
                warn!(error = %e, "telegram getUpdates failed");
                tokio::time::sleep(Duration::from_secs(ERROR_BACKOFF_SECS)).await;
            }
        }
    }
}

async fn get_updates(http: &reqwest::Client, base: &str, offset: i64) -> Result<Vec<Value>> {
    let resp: Value = http
        .get(format!("{base}/getUpdates"))
        .query(&[
            ("offset", offset.to_string()),
            ("timeout", POLL_TIMEOUT_SECS.to_string()),
            ("allowed_updates", "[\"message\"]".to_string()),
        ])
        .send()
        .await
        .context("getUpdates request")?
        .json()
        .await
        .context("getUpdates response body")?;
    if resp.get("ok").and_then(Value::as_bool) != Some(true) {
        anyhow::bail!("getUpdates returned ok=false: {resp}");
    }
    Ok(resp
        .get("result")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

async fn handle_update(http: &reqwest::Client, base: &str, storage: &dyn Storage, update: &Value) {
    let Some(message) = update.get("message") else {
        return; // edited_message, channel_post, etc. — not handled
    };
    let Some(chat_id) = message.get("chat").and_then(|c| c.get("id")) else {
        return;
    };
    let Some(text) = message.get("text").and_then(Value::as_str) else {
        return; // non-text message (photo, sticker, ...) — nothing to reply with
    };
    if !text.starts_with('/') {
        return; // not a command — this bot doesn't converse, only responds to commands
    }
    // Strip a "@BotUsername" suffix (Telegram appends it in group chats) and
    // any trailing "/status@bot arg1 arg2" arguments — none of our commands
    // take arguments today.
    let command = text
        .split_whitespace()
        .next()
        .unwrap_or(text)
        .split('@')
        .next()
        .unwrap_or(text);

    debug!(%chat_id, %command, "telegram command received");
    let reply = match command {
        "/start" => start_message(),
        "/help" => help_message(),
        "/status" => status_message(storage).await,
        _ => format!("Unknown command: {command}\n\n{}", help_message()),
    };
    match send_message(http, base, chat_id, &reply).await {
        Ok(raw) => info!(%chat_id, %command, response = %raw, "telegram command answered"),
        Err(e) => warn!(%chat_id, error = %e, "failed to send telegram reply"),
    }
}

/// Sends the reply and returns Telegram's raw JSON response body (proof of
/// real delivery — includes the real `message_id` Telegram assigned).
async fn send_message(http: &reqwest::Client, base: &str, chat_id: &Value, text: &str) -> Result<String> {
    let body = serde_json::json!({
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": true,
    });
    let resp = http
        .post(format!("{base}/sendMessage"))
        .json(&body)
        .send()
        .await
        .context("sendMessage request")?;
    let status = resp.status();
    let raw = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        anyhow::bail!("sendMessage returned {status}: {raw}");
    }
    Ok(raw)
}

fn start_message() -> String {
    "👋 Welcome to Bridge Radar.\n\n\
     I monitor cross-chain bridges into Solana in real time: signer-set \
     changes, frontend integrity, oracle staleness, and lock/mint parity \
     anomalies — all from data indexed directly off-chain, never a third \
     party's summary. When something looks wrong on a bridge, I alert here \
     automatically.\n\n\
     Commands:\n\
     /status — current health of every monitored bridge, right now\n\
     /help — list of commands\n\n\
     Source: https://github.com/Hermit210/Bridge-radar-"
        .to_string()
}

fn help_message() -> String {
    "Bridge Radar bot commands:\n\n\
     /start — what this bot does\n\
     /status — real-time health score for every monitored bridge\n\
     /help — this message"
        .to_string()
}

/// Real, live health status for every enabled (actually-monitored) bridge —
/// straight off `bridge_health_scores` via the same `Storage` trait the API
/// and scorer use. Never a cached or estimated number; a bridge with no
/// score yet says so honestly instead of being silently omitted or shown as
/// green.
async fn status_message(storage: &dyn Storage) -> String {
    let bridges = match storage.list_bridges().await {
        Ok(b) => b,
        Err(e) => return format!("⚠️ couldn't read bridge list right now: {e}"),
    };
    let scores = match storage.latest_scores().await {
        Ok(s) => s,
        Err(e) => return format!("⚠️ couldn't read health scores right now: {e}"),
    };
    let score_by_bridge: std::collections::HashMap<_, _> =
        scores.into_iter().map(|s| (s.bridge_id.clone(), s)).collect();

    let mut monitored: Vec<_> = bridges.into_iter().filter(|b| b.enabled).collect();
    monitored.sort_by(|a, b| a.id.cmp(&b.id));

    if monitored.is_empty() {
        return "No monitored bridges found.".to_string();
    }

    let mut lines = vec!["📡 Bridge Radar — live status:\n".to_string()];
    for bridge in &monitored {
        match score_by_bridge.get(&bridge.id) {
            Some(score) => lines.push(format!(
                "{} {}: {} ({})",
                band_emoji(score.score as i64),
                bridge.display_name,
                score.score,
                band(score.score as i64)
            )),
            None => lines.push(format!("⬜ {}: no score yet", bridge.display_name)),
        }
    }
    lines.join("\n")
}

fn band_emoji(score: i64) -> &'static str {
    if score >= 80 {
        "🟢"
    } else if score >= 50 {
        "🟡"
    } else {
        "🔴"
    }
}
