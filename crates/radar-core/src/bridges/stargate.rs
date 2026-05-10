use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Stargate — LayerZero-based omnichain liquidity protocol.
///
/// NOTE: Stargate is currently deployed on EVM chains only.
/// Solana deployment status: NOT YET DEPLOYED (as of 2026-05-09)
/// Monitor: https://stargateprotocol.gitbook.io/stargate/v/v2-developer-docs/technical-reference/mainnet-contracts
///
/// EVM: Stargate Router and Pool contracts on multiple chains.
pub struct StargateAdapter;

// Stargate is not deployed on Solana mainnet
const SOLANA_PROGRAMS: &[&str] = &[];

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xE8CDF27AcD73a434D661C84887215F7598e7d0d3",
    ),
    (
        ChainId::Arbitrum,
        "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    ),
    (
        ChainId::Optimism,
        "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    ),
    (
        ChainId::Base,
        "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    ),
    (
        ChainId::Polygon,
        "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    ),
    (ChainId::Bnb, "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3"),
];

impl BridgeAdapter for StargateAdapter {
    fn id(&self) -> String {
        "stargate".to_string()
    }

    fn display_name(&self) -> &str {
        "Stargate"
    }

    fn solana_programs(&self) -> &[&'static str] {
        SOLANA_PROGRAMS
    }

    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    /// Stargate is not deployed on Solana, so this always returns None.
    fn decode_solana_log(&self, _log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        None
    }

    /// Decode EVM logs for Stargate swap and liquidity events.
    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // Stargate emits Swap and LiquidityAdded/Removed events
        // For now, emit a generic Lock event for any Stargate contract event
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
