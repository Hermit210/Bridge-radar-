//! Polling fallback. Public RPC `logsSubscribe` drops events under load —
//! we periodically fetch recent signatures via `getSignaturesForAddress` and
//! resolve their logs via `getTransaction` to backfill anything the WS
//! stream missed. The Storage `INSERT OR IGNORE` makes this idempotent.

use anyhow::{Context, Result};
use radar_core::adapter::SolanaLogContext;
use radar_core::storage::SqliteStorage;
use radar_core::{BridgeAdapter, Storage};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(60);
const SIG_LIMIT: u32 = 50;

pub async fn run(
    rpc_url: String,
    watched: Vec<(String, Arc<dyn BridgeAdapter>)>,
    storage: Arc<SqliteStorage>,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut tick = interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let mut seen: HashSet<String> = HashSet::new();

    loop {
        tick.tick().await;
        for (program_id, adapter) in &watched {
            match poll_program(
                &client,
                &rpc_url,
                program_id,
                adapter.as_ref(),
                &storage,
                &mut seen,
            )
            .await
            {
                Ok(n) if n > 0 => info!(program = %program_id, count = n, "polled"),
                Ok(_) => debug!(program = %program_id, "polled — nothing new"),
                Err(e) => warn!(program = %program_id, error = %e, "poll failed"),
            }
        }
        // Cap dedupe set so it doesn't grow unbounded.
        if seen.len() > 50_000 {
            seen.clear();
        }
    }
}

async fn poll_program(
    client: &reqwest::Client,
    rpc_url: &str,
    program_id: &str,
    adapter: &dyn BridgeAdapter,
    storage: &SqliteStorage,
    seen: &mut HashSet<String>,
) -> Result<usize> {
    let sigs = get_signatures(client, rpc_url, program_id).await?;
    let mut ingested = 0usize;

    for sig in sigs.iter().rev() {
        if !seen.insert(sig.clone()) {
            continue;
        }
        let logs = match get_logs(client, rpc_url, sig).await {
            Ok(logs) => logs,
            Err(e) => {
                debug!(sig = %sig, error = %e, "skipping unfetchable tx");
                continue;
            }
        };
        for line in logs {
            let ctx = SolanaLogContext {
                signature: sig,
                slot: 0,
                program_id,
                log_line: &line,
            };
            if let Some(event) = adapter.decode_solana_log(&ctx) {
                if storage.insert_event(&event).await.is_ok() {
                    ingested += 1;
                }
            }
        }
    }
    Ok(ingested)
}

async fn get_signatures(
    client: &reqwest::Client,
    rpc_url: &str,
    program_id: &str,
) -> Result<Vec<String>> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [program_id, { "limit": SIG_LIMIT }]
    });
    let v: Value = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let arr = v
        .pointer("/result")
        .and_then(|r| r.as_array())
        .context("result not array")?;
    Ok(arr
        .iter()
        .filter_map(|item| {
            item.get("signature")
                .and_then(|s| s.as_str())
                .map(String::from)
        })
        .collect())
}

async fn get_logs(client: &reqwest::Client, rpc_url: &str, signature: &str) -> Result<Vec<String>> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            signature,
            { "commitment": "confirmed", "maxSupportedTransactionVersion": 0 }
        ]
    });
    let v: Value = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let logs = v
        .pointer("/result/meta/logMessages")
        .and_then(|l| l.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(logs)
}
