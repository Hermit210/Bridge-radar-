use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Hyperlane — Interchain messaging protocol.
///
/// Solana: Mailbox and related programs for message passing.
/// Program IDs to be verified from: https://docs.hyperlane.xyz/docs/reference/contract-addresses
///
/// EVM: Mailbox contracts on multiple chains for cross-chain messaging.
pub struct HyperlaneAdapter;

// TODO: Verify official Solana mainnet program IDs from Hyperlane docs
const SOLANA_PROGRAMS: &[&str] = &[];

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xc005dc82818d67AF737725cE604e70b1c468b8f5",
    ),
    (
        ChainId::Arbitrum,
        "0xd4C1905dd86e6B45d56b5B588DC3C993DD51b89f",
    ),
    (
        ChainId::Optimism,
        "0xd31efb3B3B928e377d2333a00C1d99fB8F6F96D3",
    ),
    (
        ChainId::Base,
        "0xeA87ae93Fa0019a82A727bfd3eBd3439B2FE8F6f",
    ),
    (
        ChainId::Polygon,
        "0x5d934f4e2f797fF51e1d729ccF622D119b8722C1",
    ),
];

impl BridgeAdapter for HyperlaneAdapter {
    fn id(&self) -> String {
        "hyperlane".to_string()
    }

    fn display_name(&self) -> &str {
        "Hyperlane"
    }

    fn solana_programs(&self) -> &[&'static str] {
        SOLANA_PROGRAMS
    }

    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    /// Decode Solana logs for Hyperlane message dispatch and delivery.
    /// Looks for `Dispatch` (outbound message) and `ProcessMessage` (inbound message) instructions.
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if SOLANA_PROGRAMS.is_empty() {
            return None;
        }

        if !SOLANA_PROGRAMS.contains(&log.program_id) {
            return None;
        }

        let line = log.log_line;
        let ix_name = line.split("Instruction: ").nth(1)?.trim();

        let kind = match ix_name {
            // Outbound message dispatch
            n if n.starts_with("Dispatch") => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            // Inbound message processing
            n if n.starts_with("ProcessMessage") => BridgeEventPayload::Unlock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            _ => return None,
        };

        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: kind,
        })
    }

    /// Decode EVM logs for Hyperlane message dispatch and delivery.
    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // Hyperlane emits Dispatch and Delivery events
        // For now, emit a generic Lock event for any Hyperlane contract event
        log.topics.first()?;

        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: log.chain.clone(),
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.tx_hash.to_string(),
            },
        })
    }
}
