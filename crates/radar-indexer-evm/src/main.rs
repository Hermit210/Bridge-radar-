//! EVM indexer. Polls `eth_getLogs` once per chain every `POLL_SECS` (a
//! single call covering every watched contract on that chain, not one call
//! per contract — see the note on `main` below), decodes via the adapter
//! registry, persists to the Storage trait.
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
// Free-tier public RPCs commonly cap eth_getLogs to a small recent-block
// window and reject anything older as an "archive" request requiring a paid
// key. Measured directly against ethereum-rpc.publicnode.com on 2026-07-23:
// a 100-block range succeeded, a 150-block range failed with exactly that
// error. 100 is a provider-agnostic safe default with headroom — other free
// RPCs may cap lower, none observed so far cap this low. Since a failed
// eth_getLogs call leaves `next_from` unchanged (see `scan_once`), a range
// that permanently exceeds a provider's limit would otherwise retry the
// same failing window forever and never make progress.
const INITIAL_LOOKBACK: u64 = 100;
const MAX_RANGE_PER_CALL: u64 = 100;

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
            // eth.llamarpc.com returned HTTP 521 (origin down) when checked
            // live on 2026-07-23 — switched default to a verified-working
            // free endpoint. See .env's comment for the full audit note.
            std::env::var("ETH_RPC_URL")
                .unwrap_or_else(|_| "https://ethereum-rpc.publicnode.com".into()),
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
            // bsc-dataseed.binance.org's eth_getLogs hit a rate/range limit
            // when checked live on 2026-07-23 — switched default.
            std::env::var("BNB_RPC_URL")
                .unwrap_or_else(|_| "https://bsc-rpc.publicnode.com".into()),
        ),
        (
            ChainId::Polygon,
            // polygon-rpc.com returned HTTP 401 ("API key disabled, tenant
            // disabled") when checked live on 2026-07-23 — switched default.
            std::env::var("POLYGON_RPC_URL")
                .unwrap_or_else(|_| "https://polygon-bor-rpc.publicnode.com".into()),
        ),
    ]
    .into_iter()
    .collect();

    // Group every registered adapter's contracts by chain so each chain gets
    // exactly ONE poller making ONE eth_getLogs call per tick (address
    // accepts an array per the JSON-RPC spec), instead of one poller *per
    // contract*. Several bridges share the same chain (e.g. wormhole,
    // allbridge, debridge, layerzero, axelar, mayan all have an Ethereum
    // leg) — fanning out a separate poller per contract meant up to 6+
    // independent pollers hammering the same free-tier RPC host every
    // POLL_SECS, which trips rate limiting (HTTP 403, confirmed live on
    // 2026-07-23 against publicnode) even with staggered start times. One
    // batched call per chain is both more efficient and the actual fix.
    let adapters = bridges::registry();
    let mut by_chain: HashMap<ChainId, Vec<(String, Arc<dyn BridgeAdapter>)>> = HashMap::new();
    for adapter in adapters {
        for (chain, contract) in adapter.evm_contracts() {
            by_chain
                .entry(chain.clone())
                .or_default()
                .push((contract.to_string(), adapter.clone()));
        }
    }

    let mut tasks = Vec::new();
    for (chain, contracts) in by_chain {
        let Some(rpc) = chain_rpcs.get(&chain).cloned() else {
            debug!(chain = %chain, "no RPC configured; skipping");
            continue;
        };
        for (contract, adapter) in &contracts {
            info!(bridge = %adapter.id(), chain = %chain, contract = %contract, "watching");
        }
        let storage = storage.clone();
        tasks.push(tokio::spawn(async move {
            poll_loop(rpc, chain, contracts, storage).await
        }));
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
    contracts: Vec<(String, Arc<dyn BridgeAdapter>)>,
    storage: Arc<SqliteStorage>,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        // Public EVM RPC endpoints (llamarpc, publicnode, base.org, etc.)
        // commonly sit behind a CDN that closes idle keep-alive connections
        // well under reqwest's 90s default pool_idle_timeout. This poller
        // fires every 12s (POLL_SECS) — squarely in the window where reqwest
        // would still think a pooled connection is good long after the
        // server dropped it, failing the next send. Same root cause and fix
        // as the Pyth Hermes client (crates/radar-core/src/pricing.rs): keep
        // idle connections well under any plausible server-side timeout so
        // reqwest always redials instead of reusing a likely-dead one.
        .pool_idle_timeout(Duration::from_secs(10))
        .user_agent("bridge-radar/0.1")
        .build()?;

    let mut tick = interval(Duration::from_secs(POLL_SECS));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let mut next_from: Option<u64> = None;

    loop {
        tick.tick().await;
        match scan_once(&client, &rpc_url, &chain, &contracts, &storage, &mut next_from).await {
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
    contracts: &[(String, Arc<dyn BridgeAdapter>)],
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

    let addresses: Vec<&str> = contracts.iter().map(|(c, _)| c.as_str()).collect();
    let logs = get_logs(client, rpc_url, &addresses, from, to).await?;
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
        // Match by address (case-insensitive — EVM addresses come back from
        // RPCs in varying checksum casing) so each log only reaches the
        // adapter(s) that actually registered that contract.
        for (contract, adapter) in contracts {
            if !contract.eq_ignore_ascii_case(&address) {
                continue;
            }
            if let Some(event) = adapter.decode_evm_log(&ctx) {
                if storage.insert_event(&event).await.is_ok() {
                    count += 1;
                }
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
    addresses: &[&str],
    from: u64,
    to: u64,
) -> Result<Vec<Value>> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getLogs",
        "params": [{
            "address": addresses,
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
