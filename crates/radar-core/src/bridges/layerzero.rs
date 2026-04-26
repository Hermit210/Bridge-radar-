use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// LayerZero — generic OApp messaging via Endpoint V2.
///
/// Endpoint V2 is the single canonical contract per chain (deterministic
/// deployment). dApps build OApps on top; we listen at the endpoint level so
/// we capture every relayed message regardless of OApp.
///
/// Solana endpoint: `LZ1qZQR2QFhkHUkbq6jKTpnyHbECFuY5gSUVCY6F2HT` —
/// verify against layerzero.network/docs before mainnet enable.
pub struct LayerZeroAdapter;

const SOLANA_ENDPOINT: &str = "LZ1qZQR2QFhkHUkbq6jKTpnyHbECFuY5gSUVCY6F2HT";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    // Endpoint V2 — same address on every chain (deterministic deploy).
    (
        ChainId::Ethereum,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (
        ChainId::Arbitrum,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (ChainId::Base, "0x1a44076050125825900e736c501f859c50fE728c"),
    (
        ChainId::Optimism,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (ChainId::Bnb, "0x1a44076050125825900e736c501f859c50fE728c"),
    (
        ChainId::Polygon,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
];

const PACKET_SENT_TOPIC: &str =
    "0x1ab700d4ced0c005b164c0f789fd09fcbb0156d4c2041b8a3bfbcd961cd1567f";

impl BridgeAdapter for LayerZeroAdapter {
    fn id(&self) -> String {
        "layerzero".to_string()
    }
    fn display_name(&self) -> &str {
        "LayerZero"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_ENDPOINT]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_ENDPOINT {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Send") {
            BridgeEventPayload::Burn {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("LzReceive") || ix.starts_with("Receive") {
            BridgeEventPayload::Mint {
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
        let topic0 = log.topics.first()?.as_str();
        if topic0 != PACKET_SENT_TOPIC {
            return None;
        }
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
