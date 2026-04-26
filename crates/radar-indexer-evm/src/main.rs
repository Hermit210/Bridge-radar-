//! EVM indexer. Polls `eth_getLogs` per (chain, contract) every `POLL_SECS`,
//! decodes via the adapter registry, persists to the Storage trait.
//!
//! v0 uses raw JSON-RPC + reqwest rather than alloy/viem so we can boot
//! against any public RPC without ABI files. The Wormhole adapter only needs
//! `topics[0]` to classify a Lock event; richer ABI decoding (asset / amount)
//! is a v1 upgrade.
//!
//! Reorg safety: we lag the latest block by `CONFIRMATION_BLOCKS` and never
//! revisit blocks we've already scanned. INSERT OR IGNORE on the (id) PK
//! makes overlapping windows idempotent.

use anyhow::{Context, Result};
use radar_core::adapter::EvmLogContext;
use radar_core::chain::ChainId;
use radar_core::storage::SqliteStorage;
use radar_core::{bridges, BridgeAdapter, Storage};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use tracing_subscriber::EnvFilter;

const POLL_SECS: u64 = 12;
const CONFIRMATION_BLOCKS: u64 = 12;
const INITIAL_LOOKBACK: u64 = 200;
const MAX_RANGE_PER_CALL: u64 = 1_000;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_indexer_evm=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    if let Some(stripped) = db_url.strip_prefix("sqlite://") {
        if let Some(parent) = std::path::Path::new(stripped).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
    }

    let storage = Arc::new(
        SqliteStorage::connect(&db_url)
            .await
            .context("connecting to storage")?,
    );

    // Build (chain, rpc_url, contracts[]) tuples from registered adapters.
    let chain_rpcs: HashMap<ChainId, String> = [
        (
            ChainId::Ethereum,
            std::env::var("ETH_RPC_URL").unwrap_or_else(|_| "https://eth.llamarpc.com".into()),
        ),
        (
            ChainId::Arbitrum,
            std::env::var("ARBITRUM_RPC_URL")
                .unwrap_or_else(|_| "https://arb1.arbitrum.io/rpc".into()),
        ),
        (
            ChainId::Base,
            std::env::var("BASE_RPC_URL").unwrap_or_else(|_| "https://mainnet.base.org".into()),
        ),
        (
            ChainId::Optimism,
            std::env::var("OPTIMISM_RPC_URL")
                .unwrap_or_else(|_| "https://mainnet.optimism.io".into()),
        ),
        (
            ChainId::Bnb,
            std::env::var("BNB_RPC_URL")
                .unwrap_or_else(|_| "https://bsc-dataseed.binance.org".into()),
        ),
        (
            ChainId::Polygon,
            std::env::var("POLYGON_RPC_URL").unwrap_or_else(|_| "https://polygon-rpc.com".into()),
        ),
    ]
    .into_iter()
    .collect();

    // For each registered adapter, fan out a poller per (chain, contract).
    let adapters = bridges::registry();
    let mut tasks = Vec::new();
    for adapter in adapters {
        for (chain, contract) in adapter.evm_contracts() {
            let Some(rpc) = chain_rpcs.get(chain).cloned() else {
                debug!(chain = %chain, "no RPC configured; skipping");
                continue;
            };
            let storage = storage.clone();
            let adapter = adapter.clone();
            let chain = chain.clone();
            let contract = contract.to_string();
            info!(
                bridge = %adapter.id(),
                chain = %chain,
                contract = %contract,
                "starting EVM poller"
            );
            tasks.push(tokio::spawn(async move {
                poll_loop(rpc, chain, contract, adapter, storage).await
            }));
        }
    }

    if tasks.is_empty() {
        warn!("no EVM (chain, contract) pairs registered — nothing to do");
        return Ok(());
    }

    for t in tasks {
        if let Err(e) = t.await {
            warn!(error = %e, "evm poller task panicked");
        }
    }
    Ok(())
}

async fn poll_loop(
    rpc_url: String,
    chain: ChainId,
    contract: String,
    adapter: Arc<dyn BridgeAdapter>,
    storage: Arc<SqliteStorage>,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut tick = interval(Duration::from_secs(POLL_SECS));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let mut next_from: Option<u64> = None;

    loop {
        tick.tick().await;
        match scan_once(
            &client,
            &rpc_url,
            &chain,
            &contract,
            &adapter,
            &storage,
            &mut next_from,
        )
        .await
        {
            Ok(0) => debug!(chain = %chain, "scanned — no new logs"),
            Ok(n) => info!(chain = %chain, count = n, "ingested"),
            Err(e) => warn!(chain = %chain, error = %e, "scan failed"),
        }
    }
}

async fn scan_once(
    client: &reqwest::Client,
    rpc_url: &str,
    chain: &ChainId,
    contract: &str,
    adapter: &Arc<dyn BridgeAdapter>,
    storage: &Arc<SqliteStorage>,
    next_from: &mut Option<u64>,
) -> Result<usize> {
    let head = get_block_number(client, rpc_url).await?;
    let safe_head = head.saturating_sub(CONFIRMATION_BLOCKS);
    let from = next_from.unwrap_or(safe_head.saturating_sub(INITIAL_LOOKBACK));
    if from > safe_head {
        return Ok(0);
    }
    let to = (from + MAX_RANGE_PER_CALL - 1).min(safe_head);

    let logs = get_logs(client, rpc_url, contract, from, to).await?;
    let mut count = 0;
    for log in logs {
        let topics: Vec<String> = log
            .get("topics")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let tx_hash = log
            .get("transactionHash")
            .and_then(|h| h.as_str())
            .unwrap_or("")
            .to_string();
        let address = log
            .get("address")
            .and_then(|a| a.as_str())
            .unwrap_or("")
            .to_string();
        let data = log
            .get("data")
            .and_then(|d| d.as_str())
            .unwrap_or("")
            .to_string();
        let block_number = log
            .get("blockNumber")
            .and_then(|b| b.as_str())
            .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok())
            .unwrap_or(0);

        let ctx = EvmLogContext {
            chain: chain.clone(),
            block_number,
            tx_hash: &tx_hash,
            address: &address,
            topics: &topics,
            data: &data,
        };
        if let Some(event) = adapter.decode_evm_log(&ctx) {
            if storage.insert_event(&event).await.is_ok() {
                count += 1;
            }
        }
    }

    *next_from = Some(to + 1);
    Ok(count)
}

async fn get_block_number(client: &reqwest::Client, rpc_url: &str) -> Result<u64> {
    let v: Value = client
        .post(rpc_url)
        .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": [] }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let s = v
        .get("result")
        .and_then(|r| r.as_str())
        .context("eth_blockNumber missing result")?;
    Ok(u64::from_str_radix(s.trim_start_matches("0x"), 16)?)
}

async fn get_logs(
    client: &reqwest::Client,
    rpc_url: &str,
    address: &str,
    from: u64,
    to: u64,
) -> Result<Vec<Value>> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getLogs",
        "params": [{
            "address": address,
            "fromBlock": format!("0x{:x}", from),
            "toBlock":   format!("0x{:x}", to),
        }]
    });
    let v: Value = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if let Some(err) = v.get("error") {
        anyhow::bail!("eth_getLogs error: {err}");
    }
    Ok(v.get("result")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default())
}
