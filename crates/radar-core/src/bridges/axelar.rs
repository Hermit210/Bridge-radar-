use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Axelar — validator-set + Squid routing on Solana.
///
/// Axelar reached Solana via the Squid router + Axelar gateway program.
/// Solana program ID needs verification before mainnet (Axelar's Solana
/// integration shipped late and the canonical program ID has rotated).
pub struct AxelarAdapter;

const SOLANA_GATEWAY: &str = "AXLrkhuKFknA9oGPNRP9ARpyQbNCMEmxXEX3FMP1rEoF";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0x4F4495243837681061C4743b74B3eEdf548D56A5",
    ),
    (
        ChainId::Arbitrum,
        "0xe432150cce91c13a887f7D836923d5597adD8E31",
    ),
    (ChainId::Base, "0xe432150cce91c13a887f7D836923d5597adD8E31"),
    (
        ChainId::Optimism,
        "0xe432150cce91c13a887f7D836923d5597adD8E31",
    ),
    (ChainId::Bnb, "0x304acf330bbE08d1e512eefaa92F6a57871fD895"),
    (
        ChainId::Polygon,
        "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
    ),
];

const CONTRACT_CALL_TOPIC: &str =
    "0x30ae6cc78c27e651745bf2ad08a11de83910ac1e347a52f7ac898c0fbef94dae";

impl BridgeAdapter for AxelarAdapter {
    fn id(&self) -> String {
        "axelar".to_string()
    }
    fn display_name(&self) -> &str {
        "Axelar"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_GATEWAY]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_GATEWAY {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Approve") || ix.starts_with("Execute") {
            BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("CallContract") || ix.starts_with("Send") {
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
        let topic0 = log.topics.first()?.as_str();
        if topic0 != CONTRACT_CALL_TOPIC {
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
