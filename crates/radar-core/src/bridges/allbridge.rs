use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Allbridge — Allbridge Core (the v2 SPL bridge).
///
/// Solana: `BrdgEoYCMWgRNKFt9Dx6JmAZAvWmu6oW3aZ4HGwjeoP` (Allbridge Core
/// program — treat as TODO-verify before mainnet enable; the indexer simply
/// ingests zero events if the program is wrong).
///
/// EVM: per-chain Allbridge Core entrypoints — verify against
/// docs.allbridgecoreapi.net before mainnet.
pub struct AllbridgeAdapter;

const SOLANA_CORE: &str = "BrdgEoYCMWgRNKFt9Dx6JmAZAvWmu6oW3aZ4HGwjeoP";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0x609c690e8F7D68a59885c9132e812eEbDaAf0c9e",
    ),
    (ChainId::Bnb, "0xBBbD1BbB4f9b936C3604906D7592A644071dE884"),
    (
        ChainId::Polygon,
        "0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D",
    ),
    (
        ChainId::Arbitrum,
        "0x9Ce3447B58D58e8602B7306316A5fF011B92d189",
    ),
];

impl BridgeAdapter for AllbridgeAdapter {
    fn id(&self) -> String {
        "allbridge".to_string()
    }
    fn display_name(&self) -> &str {
        "Allbridge"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_CORE]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_CORE {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("ReceiveTokens") || ix.starts_with("Receive") {
            BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("Swap") || ix.starts_with("SendTokens") || ix.starts_with("Send") {
            BridgeEventPayload::Burn {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else {
            return None;
        };
        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: kind,
        })
    }

    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // Allbridge Core SwapAndBridge / TokensReceived events — match on
        // *any* topic for an enabled contract. Allbridge has many event
        // shapes; v1 emits a coarse Lock event per relayed message.
        log.topics.first()?;
        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: log.chain.clone(),
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.tx_hash.into(),
            },
        })
    }
}
