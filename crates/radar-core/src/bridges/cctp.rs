use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Circle CCTP — Cross-Chain Transfer Protocol for USDC.
///
/// Solana: TokenMessengerMinterV2 and MessageTransmitterV2 programs.
/// Program IDs to be verified from: https://developers.circle.com/cctp/solana-programs
///
/// EVM: CCTP contracts on multiple chains for USDC transfers.
pub struct CctpAdapter;

// TODO: Verify official Solana mainnet program IDs from Circle docs
const SOLANA_PROGRAMS: &[&str] = &[];

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xBd3fa81B58ba92a82136038B25aDec7066e1C915",
    ),
    (ChainId::Arbitrum, "0x19330d10B9afbAF0D5f3650C15b6f0Df4d2eCFa2"),
    (ChainId::Optimism, "0x682E473fCf094c2eD630eEf98B11B8e76485e181"),
    (ChainId::Base, "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962"),
    (ChainId::Polygon, "0x9baC7ff25590c8E4C3ba3011Fe9E6dcF1f46a2E2"),
];

impl BridgeAdapter for CctpAdapter {
    fn id(&self) -> String {
        "cctp".to_string()
    }

    fn display_name(&self) -> &str {
        "Circle CCTP"
    }

    fn solana_programs(&self) -> &[&'static str] {
        SOLANA_PROGRAMS
    }

    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    /// Decode Solana logs for CCTP deposit/burn and receive/mint operations.
    /// Looks for `DepositForBurn` (burn) and `HandleReceiveFinalizedMessage` (mint) instructions.
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
            // Burn USDC on Solana for cross-chain transfer
            n if n.starts_with("DepositForBurn") => BridgeEventPayload::Burn {
                chain: ChainId::Solana,
                asset: "USDC".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            // Mint USDC on Solana from cross-chain transfer
            n if n.starts_with("HandleReceiveFinalizedMessage") => BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "USDC".to_string(),
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

    /// Decode EVM logs for CCTP deposit and receive events.
    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // CCTP emits DepositForBurn and ReceiveMessage events
        // For now, emit a generic Lock event for any CCTP contract event
        log.topics.first()?;

        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: log.chain.clone(),
                asset: "USDC".to_string(),
                amount_usd: 0.0,
                tx: log.tx_hash.to_string(),
            },
        })
    }
}
