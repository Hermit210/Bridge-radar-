//! Periodic detector binary. Bundles the three detectors that don't fit the
//! event-stream model into a single tokio process:
//!
//! - `signer_set` polls each bridge's canonical signer registry, diffs against
//!   the last-known set, emits `signer_change`.
//! - `frontend_hash` fetches each bridge's official URL, sha256s the body,
//!   emits `frontend_change` when the hash drifts from the last region-consensus
//!   value.
//! - `oracle_stale` for the Pyth feeds bridges depend on, alerts if
//!   `now - last_publish > threshold`.
//!
//! All three persist their findings as `BridgeEvent` rows so the scorer +
//! API see them automatically; the scorer's HealthScore composer reads
//! `signer_change`, `frontend_change`, and `oracle_stale` events from the
//! event stream and folds them into the per-bridge severity components.

mod frontend;
mod oracle;
mod signer;

use anyhow::{Context, Result};
use radar_core::storage::SqliteStorage;
use std::sync::Arc;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_watchers=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    info!(%db_url, "starting watchers (signer + frontend + oracle)");

    let storage = Arc::new(
        SqliteStorage::connect(&db_url)
            .await
            .context("connect storage")?,
    );

    let signer_handle = tokio::spawn(signer::run(storage.clone()));
    let frontend_handle = tokio::spawn(frontend::run(storage.clone()));
    let oracle_handle = tokio::spawn(oracle::run(storage.clone()));

    tokio::select! {
        r = signer_handle => match r {
            Ok(Ok(())) => info!("signer task exited"),
            Ok(Err(e)) => warn!(error = %e, "signer task failed"),
            Err(e)     => warn!(error = %e, "signer task panicked"),
        },
        r = frontend_handle => match r {
            Ok(Ok(())) => info!("frontend task exited"),
            Ok(Err(e)) => warn!(error = %e, "frontend task failed"),
            Err(e)     => warn!(error = %e, "frontend task panicked"),
        },
        r = oracle_handle => match r {
            Ok(Ok(())) => info!("oracle task exited"),
            Ok(Err(e)) => warn!(error = %e, "oracle task failed"),
            Err(e)     => warn!(error = %e, "oracle task panicked"),
        },
    }
    Ok(())
}
