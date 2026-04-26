//! On-chain attester. Reads the latest Health Score per bridge from local
//! storage, derives the `BridgeHealth` PDA, and pushes `update_health` (with
//! a one-time `init_bridge` per bridge) to the deployed `radar-oracle`
//! program.
//!
//! v1: single attester (the keypair at `ATTESTER_KEYPAIR_PATH`). Multi-
//! attester quorum is v2 and gated on a public attester role discussion.

use anyhow::{anyhow, Context, Result};
use radar_core::storage::SqliteStorage;
use radar_core::Storage;
use sha2::{Digest, Sha256};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Signer};
#[allow(deprecated)]
use solana_sdk::system_program;
use solana_sdk::transaction::Transaction;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("radar=info,radar_attester=info")),
        )
        .init();

    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/radar.db".to_string());
    let rpc_url = std::env::var("ATTESTER_RPC_URL")
        .or_else(|_| std::env::var("SOLANA_RPC_URL"))
        .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    let program_id_str = std::env::var("ORACLE_PROGRAM_ID")
        .unwrap_or_else(|_| "944WKQwFt6tuDXZTEwN35mC62V3h2r1ekUtceeAyDiNC".to_string());
    let keypair_path =
        std::env::var("ATTESTER_KEYPAIR_PATH").unwrap_or_else(|_| "./attester.json".to_string());
    let push_interval_secs = std::env::var("ATTESTER_PUSH_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(60);

    let program_id =
        Pubkey::from_str(&program_id_str).context("ORACLE_PROGRAM_ID is not a valid pubkey")?;
    let keypair = read_keypair_file(&keypair_path).map_err(|e| {
        anyhow!(
            "could not load attester keypair from {keypair_path}: {e}. Generate with: \
             `solana-keygen new --outfile {keypair_path}`"
        )
    })?;
    let attester_pubkey = keypair.pubkey();

    info!(
        rpc = %rpc_url, program = %program_id, attester = %attester_pubkey,
        push_secs = push_interval_secs, %db_url,
        "starting attester"
    );

    let storage = Arc::new(
        SqliteStorage::connect(&db_url)
            .await
            .context("connect storage")?,
    );
    let rpc = Arc::new(RpcClient::new_with_commitment(
        rpc_url,
        CommitmentConfig::confirmed(),
    ));

    let mut tick = interval(Duration::from_secs(push_interval_secs));
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tick.tick().await;
        match push_once(&storage, &rpc, &program_id, &keypair).await {
            Ok(n) if n > 0 => info!(updated = n, "attester tick"),
            Ok(_) => info!("attester tick — no scores to push"),
            Err(e) => warn!(error = %e, "attester tick failed"),
        }
    }
}

async fn push_once(
    storage: &SqliteStorage,
    rpc: &RpcClient,
    program_id: &Pubkey,
    keypair: &solana_sdk::signature::Keypair,
) -> Result<usize> {
    let scores = storage.latest_scores().await?;
    let mut updated = 0;
    for score in scores {
        let bridge_id_hash = sha256_32(score.bridge_id.as_bytes());
        let (pda, _bump) = Pubkey::find_program_address(&[b"health", &bridge_id_hash], program_id);

        // Probe whether the PDA exists. If it doesn't, run init_bridge first
        // so the attester is fully self-bootstrapping on devnet.
        let exists = rpc.get_account(&pda).await.is_ok();
        if !exists {
            match send_init_bridge(
                rpc,
                program_id,
                keypair,
                &pda,
                bridge_id_hash,
                keypair.pubkey(),
            )
            .await
            {
                Ok(sig) => info!(bridge = %score.bridge_id, %sig, "init_bridge"),
                Err(e) => {
                    warn!(bridge = %score.bridge_id, error = %e, "init_bridge failed; skipping update");
                    continue;
                }
            }
        }

        match send_update_health(rpc, program_id, keypair, &pda, bridge_id_hash, score.score).await
        {
            Ok(sig) => {
                info!(
                    bridge = %score.bridge_id, score = score.score, %sig,
                    "update_health"
                );
                updated += 1;
            }
            Err(e) => warn!(bridge = %score.bridge_id, error = %e, "update_health failed"),
        }
    }
    Ok(updated)
}

fn sha256_32(input: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(input);
    h.finalize().into()
}

/// Anchor instruction discriminator = first 8 bytes of `sha256("global:<name>")`.
fn anchor_disc(name: &str) -> [u8; 8] {
    let preimage = format!("global:{name}");
    let h = sha256_32(preimage.as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&h[..8]);
    out
}

async fn send_init_bridge(
    rpc: &RpcClient,
    program_id: &Pubkey,
    payer: &solana_sdk::signature::Keypair,
    pda: &Pubkey,
    bridge_id: [u8; 32],
    attester: Pubkey,
) -> Result<solana_sdk::signature::Signature> {
    // Args: bridge_id ([u8;32]) + attester (Pubkey)  → borsh: 32 + 32 bytes
    let mut data = Vec::with_capacity(8 + 32 + 32);
    data.extend_from_slice(&anchor_disc("init_bridge"));
    data.extend_from_slice(&bridge_id);
    data.extend_from_slice(attester.as_ref());

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*pda, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    };
    send_tx(rpc, payer, ix).await
}

async fn send_update_health(
    rpc: &RpcClient,
    program_id: &Pubkey,
    attester: &solana_sdk::signature::Keypair,
    pda: &Pubkey,
    bridge_id: [u8; 32],
    score: u8,
) -> Result<solana_sdk::signature::Signature> {
    // Args: bridge_id ([u8;32]) + score (u8)
    let mut data = Vec::with_capacity(8 + 32 + 1);
    data.extend_from_slice(&anchor_disc("update_health"));
    data.extend_from_slice(&bridge_id);
    data.push(score);

    let ix = Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*pda, false),
            AccountMeta::new_readonly(attester.pubkey(), true),
        ],
        data,
    };
    send_tx(rpc, attester, ix).await
}

async fn send_tx(
    rpc: &RpcClient,
    signer: &solana_sdk::signature::Keypair,
    ix: Instruction,
) -> Result<solana_sdk::signature::Signature> {
    let blockhash = rpc.get_latest_blockhash().await?;
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&signer.pubkey()), &[signer], blockhash);
    Ok(rpc.send_and_confirm_transaction(&tx).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminator_is_first_8_bytes_of_namespaced_sha256() {
        let d = anchor_disc("init_bridge");
        // sanity: deterministic and 8 bytes
        assert_eq!(d.len(), 8);
        assert_eq!(d, anchor_disc("init_bridge"));
        assert_ne!(d, anchor_disc("update_health"));
    }

    #[test]
    fn pda_derives_deterministically() {
        let prog = Pubkey::new_unique();
        let id = sha256_32(b"wormhole");
        let (a, _) = Pubkey::find_program_address(&[b"health", &id], &prog);
        let (b, _) = Pubkey::find_program_address(&[b"health", &id], &prog);
        assert_eq!(a, b);
    }
}
