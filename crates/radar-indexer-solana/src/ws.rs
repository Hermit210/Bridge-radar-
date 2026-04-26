//! WebSocket `logsSubscribe` driver with reconnect + backoff.

use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use radar_core::adapter::SolanaLogContext;
use radar_core::storage::SqliteStorage;
use radar_core::{BridgeAdapter, Storage};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};
use url::Url;

const MAX_BACKOFF: Duration = Duration::from_secs(60);
const MIN_BACKOFF: Duration = Duration::from_secs(1);

pub async fn run(
    ws_url: String,
    watched: Vec<(String, Arc<dyn BridgeAdapter>)>,
    storage: Arc<SqliteStorage>,
) -> Result<()> {
    let mut backoff = MIN_BACKOFF;

    loop {
        match connect_and_drive(&ws_url, &watched, storage.clone()).await {
            Ok(()) => {
                info!("ws stream closed cleanly; reconnecting");
                backoff = MIN_BACKOFF;
            }
            Err(e) => {
                warn!(error = %e, ?backoff, "ws stream errored; backing off");
            }
        }
        sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn connect_and_drive(
    ws_url: &str,
    watched: &[(String, Arc<dyn BridgeAdapter>)],
    storage: Arc<SqliteStorage>,
) -> Result<()> {
    let url = Url::parse(ws_url).context("parsing SOLANA_WS_URL")?;
    let (mut socket, _resp) = tokio_tungstenite::connect_async(url.as_str())
        .await
        .context("ws connect")?;

    info!(url = %ws_url, "ws connected");

    // logsSubscribe per program, with `mentions` filter for low-noise streams.
    for (idx, (program_id, _adapter)) in watched.iter().enumerate() {
        let req = json!({
            "jsonrpc": "2.0",
            "id": idx + 1,
            "method": "logsSubscribe",
            "params": [
                { "mentions": [program_id] },
                { "commitment": "confirmed" }
            ]
        });
        socket
            .send(Message::Text(req.to_string()))
            .await
            .context("send logsSubscribe")?;
    }

    while let Some(msg) = socket.next().await {
        let msg = msg.context("ws stream item")?;
        let text = match msg {
            Message::Text(t) => t,
            Message::Binary(b) => match std::str::from_utf8(&b) {
                Ok(s) => s.to_string(),
                Err(_) => continue,
            },
            Message::Ping(p) => {
                socket.send(Message::Pong(p)).await.ok();
                continue;
            }
            Message::Close(_) => {
                return Err(anyhow!("server closed the connection"));
            }
            _ => continue,
        };

        let v: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                debug!(error = %e, "non-json frame; skipping");
                continue;
            }
        };

        // Subscription confirmation: { jsonrpc, result: <subId>, id }
        if v.get("method").is_none() {
            if let Some(id) = v.get("id") {
                debug!(?id, "subscription confirmed");
            }
            continue;
        }

        // Notification: { method:"logsNotification", params: { result: { value: { logs, signature, slot } } } }
        let value = v
            .pointer("/params/result/value")
            .and_then(|x| x.as_object());
        let Some(value) = value else {
            continue;
        };
        let signature = value
            .get("signature")
            .and_then(|s| s.as_str())
            .unwrap_or("");
        let slot = v
            .pointer("/params/result/context/slot")
            .and_then(|s| s.as_u64())
            .unwrap_or(0);
        let logs = value.get("logs").and_then(|l| l.as_array());
        let Some(logs) = logs else { continue };

        // The mentions filter doesn't tell us *which* program the log line is
        // for, so we feed the line to every adapter watching this program id.
        // Adapters return None for lines they don't handle.
        for log_value in logs {
            let Some(line) = log_value.as_str() else {
                continue;
            };
            // Heuristic: lines from the actual program look like "Program <pid> invoke" —
            // we still try every adapter since `mentions` already filtered.
            for (pid, adapter) in watched {
                let ctx = SolanaLogContext {
                    signature,
                    slot,
                    program_id: pid,
                    log_line: line,
                };
                if let Some(event) = adapter.decode_solana_log(&ctx) {
                    match storage.insert_event(&event).await {
                        Ok(()) => {
                            info!(
                                bridge = %event.bridge_id,
                                kind = event.kind().as_str(),
                                sig = %signature,
                                "ingested"
                            );
                        }
                        Err(e) => error!(error = %e, "failed to persist event"),
                    }
                }
            }
        }
    }

    Ok(())
}
