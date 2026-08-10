//! Real Solana finality-time tracker ("Finality Watch") — polls `getSlot`
//! at both `confirmed` and `finalized` commitment (both fully documented at
//! <https://solana.com/docs/rpc/http/getslot>; response is just the real
//! `u64` slot number at that commitment level). When a slot we previously
//! saw reach `confirmed` is later reported `finalized`, the real elapsed
//! wall-clock time between those two observations is recorded via
//! [`radar_core::Storage::insert_finality_observation`].
//!
//! Deliberately *not* using `getBlockCommitment`: its real response is a
//! 32-element lockout-depth stake array, and the official docs don't
//! disclose which depth index corresponds to "confirmed" vs "finalized" —
//! using it would mean guessing a field's meaning, which this project's
//! rules forbid. `getSlot(commitment)` is fully documented for exactly the
//! two states we care about, so that's what this uses.
//!
//! These are polling-observed timestamps, not canonical on-chain data —
//! Solana doesn't record a single "finalized at" instant. Bounded by
//! `POLL_INTERVAL` below: if several slots advance within one poll tick,
//! they share that tick's observed timestamp, which is an honest
//! consequence of polling rather than subscribing to a per-slot commitment
//! stream (no such WebSocket subscription exists — `slotSubscribe` only
//! reports raw processing progress, not commitment level; confirmed via
//! <https://solana.com/docs/rpc/websocket/slotsubscribe>).

use anyhow::{Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use radar_core::finality::FinalityObservation;
use radar_core::Storage;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{info, warn};

/// Poll cadence. Solana's real slot time is ~400ms; polling every 1s keeps
/// RPC load modest (two calls per tick) while still resolving confirm ->
/// finalize gaps to within about a second, comfortably fine-grained
/// relative to the ~12.8s TowerBFT gap this is meant to track (and still
/// useful, if coarser, once Alpenglow's ~100-150ms finality is active).
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Real trailing window used both to score each new observation's
/// `is_anomalous` at insert time and to prune the in-memory "seen
/// confirmed, not yet finalized" map so it can't grow unbounded if a slot
/// somehow never finalizes.
const BASELINE_WINDOW: ChronoDuration = ChronoDuration::hours(1);

pub async fn run(rpc_url: String, storage: Arc<dyn Storage>) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        // Same reasoning as poll.rs / pricing.rs: keep pooled connections
        // well under any plausible server-side idle-close timeout so
        // reqwest always redials instead of reusing a dead one.
        .pool_idle_timeout(Duration::from_secs(10))
        .user_agent("bridge-radar/0.1")
        .build()?;

    let mut tick = interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let mut last_confirmed: Option<u64> = None;
    let mut last_finalized: Option<u64> = None;
    // slot -> real wall-clock time we first observed it reach `confirmed`.
    let mut confirmed_at: HashMap<u64, chrono::DateTime<Utc>> = HashMap::new();

    loop {
        tick.tick().await;

        let confirmed_slot = match get_slot(&client, &rpc_url, "confirmed").await {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "finality watch: getSlot(confirmed) failed");
                continue;
            }
        };
        let now = Utc::now();
        if let Some(prev) = last_confirmed {
            for slot in (prev + 1)..=confirmed_slot {
                confirmed_at.entry(slot).or_insert(now);
            }
        } else {
            confirmed_at.insert(confirmed_slot, now);
        }
        last_confirmed = Some(confirmed_slot);

        let finalized_slot = match get_slot(&client, &rpc_url, "finalized").await {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "finality watch: getSlot(finalized) failed");
                continue;
            }
        };

        let newly_finalized: Vec<u64> = match last_finalized {
            Some(prev) if finalized_slot > prev => ((prev + 1)..=finalized_slot).collect(),
            None => vec![finalized_slot],
            _ => Vec::new(),
        };

        if !newly_finalized.is_empty() {
            let finalized_at = Utc::now();
            // Real trailing-hour window, fetched once per tick and reused
            // for every slot finalized this tick -- they're all being
            // scored against essentially the same real baseline moment.
            let window = match storage.finality_observations_since(finalized_at - BASELINE_WINDOW).await {
                Ok(w) => w,
                Err(e) => {
                    warn!(error = %e, "finality watch: failed to load baseline window");
                    Vec::new()
                }
            };

            for slot in newly_finalized {
                let Some(&observed_confirmed_at) = confirmed_at.get(&slot) else {
                    // We only started observing after this slot was already
                    // confirmed (e.g. at startup) -- honestly skip rather
                    // than fabricate a confirmed_at we never measured.
                    continue;
                };
                let obs = FinalityObservation::observe(slot, observed_confirmed_at, finalized_at, &window);
                match storage.insert_finality_observation(&obs).await {
                    Ok(()) => {
                        info!(
                            slot,
                            elapsed_ms = obs.elapsed_ms,
                            baseline_ms = ?obs.baseline_ms_at_time,
                            anomalous = obs.is_anomalous,
                            "finality watch: observed real confirmed -> finalized"
                        );
                    }
                    Err(e) => warn!(error = %e, slot, "finality watch: failed to persist observation"),
                }
                confirmed_at.remove(&slot);
            }
        }
        last_finalized = Some(finalized_slot);

        // Defensive bound: prune any confirmed-but-never-finalized entries
        // older than the baseline window so a pathological RPC/chain state
        // can't leak memory here.
        if confirmed_at.len() > 10_000 {
            let cutoff = Utc::now() - BASELINE_WINDOW;
            confirmed_at.retain(|_, t| *t >= cutoff);
        }
    }
}

/// Real `getSlot` call at the given commitment level. Response shape is
/// just `{ "result": <u64> }` — confirmed against
/// <https://solana.com/docs/rpc/http/getslot> before this was written.
async fn get_slot(client: &reqwest::Client, rpc_url: &str, commitment: &str) -> Result<u64> {
    let req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSlot",
        "params": [{ "commitment": commitment }]
    });
    let v: Value = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    v.get("result")
        .and_then(|r| r.as_u64())
        .context("getSlot response missing numeric result")
}
