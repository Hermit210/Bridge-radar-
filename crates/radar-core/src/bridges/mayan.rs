use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Mayan — Swift solver-based settlement (auctioneer + solver model).
///
/// Solana solver settlement program: `MAyANxBRcqRXaPfWoZyURiE9PyuYDxoR1dbW2hkfjxR`.
/// Verify before mainnet enable.
///
/// EVM forwarder contracts on each origin chain; users submit intents that
/// solvers fulfill on Solana.
pub struct MayanAdapter;

const SOLANA_SOLVER: &str = "MAyANxBRcqRXaPfWoZyURiE9PyuYDxoR1dbW2hkfjxR";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C",
    ),
    (
        ChainId::Arbitrum,
        "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C",
    ),
    (ChainId::Base, "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C"),
];

impl BridgeAdapter for MayanAdapter {
    fn id(&self) -> String {
        "mayan".to_string()
    }
    fn display_name(&self) -> &str {
        "Mayan"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_SOLVER]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_SOLVER {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Settle") || ix.starts_with("Fulfill") {
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
