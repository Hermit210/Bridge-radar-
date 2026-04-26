//! Solana indexer binary. Subscribes to logs for every program registered by
//! a [`radar_core::BridgeAdapter`] via WebSocket `logsSubscribe`, with an
//! HTTP polling fallback because public RPCs drop.

mod poll;
mod ws;

use anyhow::{Context, Result};
use radar_core::storage::SqliteStorage;
use radar_core::{bridges, BridgeAdapter};
use std::sync::Arc;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_indexer_solana=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    let ws_url = std::env::var("SOLANA_WS_URL")
        .unwrap_or_else(|_| "wss://api.mainnet-beta.solana.com".to_string());
    let rpc_url = std::env::var("SOLANA_RPC_URL")
        .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".to_string());

    // Ensure SQLite data dir exists.
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    info!(%ws_url, %rpc_url, %db_url, "starting Solana indexer");

    let storage = Arc::new(
        SqliteStorage::connect(&db_url)
            .await
            .context("connecting to storage")?,
    );

    // Collect every Solana program any registered adapter cares about.
    let adapters: Vec<Arc<dyn BridgeAdapter>> = bridges::registry();
    let watched: Vec<(String, Arc<dyn BridgeAdapter>)> = adapters
        .iter()
        .flat_map(|a| {
            a.solana_programs()
                .iter()
                .map(move |pid| (pid.to_string(), a.clone()))
        })
        .collect();

    if watched.is_empty() {
        warn!("no Solana programs registered by any adapter — nothing to do");
        return Ok(());
    }

    info!(count = watched.len(), "watching Solana programs");
    for (pid, adapter) in &watched {
        info!(program_id = %pid, bridge = %adapter.id(), "subscribed");
    }

    let ws_handle = tokio::spawn(ws::run(ws_url.clone(), watched.clone(), storage.clone()));
    let poll_handle = tokio::spawn(poll::run(rpc_url.clone(), watched.clone(), storage.clone()));

    // Either task crashing should bring the indexer down so a supervisor
    // (systemd / docker / k8s) can restart it cleanly.
    tokio::select! {
        r = ws_handle => match r {
            Ok(Ok(())) => info!("ws task exited"),
            Ok(Err(e)) => warn!(error = %e, "ws task failed"),
            Err(e) => warn!(error = %e, "ws task panicked"),
        },
        r = poll_handle => match r {
            Ok(Ok(())) => info!("poll task exited"),
            Ok(Err(e)) => warn!(error = %e, "poll task failed"),
            Err(e) => warn!(error = %e, "poll task panicked"),
        },
    }
    Ok(())
}
