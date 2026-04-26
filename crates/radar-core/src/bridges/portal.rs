use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::BridgeEvent;

/// Portal — the Wormhole token bridge frontend / wrapped-asset family.
///
/// Portal *uses* the same Solana token bridge program as Wormhole
/// (`wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb`) but tracks a distinct
/// subset of wrapped mints for accounting purposes — wrappedSOL, wETH-portal,
/// etc. We track Portal-specific mints separately so per-asset parity works.
///
/// In v1 we share the same Solana program ID with the WormholeAdapter; the
/// indexer's adapter dispatch will fire both adapters on each token-bridge
/// log line. The ParityState rows are keyed by (bridge_id, asset) so the
/// double-write is benign — each bridge gets its own column.
pub struct PortalAdapter;

const SOLANA_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";

impl BridgeAdapter for PortalAdapter {
    fn id(&self) -> String {
        "portal".to_string()
    }
    fn display_name(&self) -> &str {
        "Portal"
    }
    fn solana_programs(&self) -> &[&'static str] {
        // Intentionally same as Wormhole — Portal IS the Wormhole token
        // bridge from the Solana program's perspective. The two adapters
        // distinguish the *asset* set they care about, not the program.
        &[SOLANA_TOKEN_BRIDGE]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Portal-specific TokenBridge contracts (Wormhole core publishes
        // PortalAddresses per chain). For v1 we treat Portal as an asset
        // filter on the Wormhole event stream rather than a separate
        // contract subscription.
        &[]
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        // For v1 we *don't* decode here — the WormholeAdapter already emits
        // events for the same program. Portal-as-asset-filter logic merges
        // in once the indexer learns to populate `asset` (Pyth-pricing
        // commit) and we can route by mint to either bridge.
        let _ = log;
        None
    }

    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // Same Wormhole core LogMessagePublished — defer to Wormhole.
        let _ = log;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::SolanaLogContext;

    #[test]
    fn portal_does_not_double_emit_on_wormhole_logs() {
        let a = PortalAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_TOKEN_BRIDGE,
            log_line: "Program log: Instruction: CompleteTransferNative",
        };
        assert!(a.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn portal_shares_solana_program_with_wormhole() {
        let a = PortalAdapter;
        assert_eq!(a.solana_programs(), &[SOLANA_TOKEN_BRIDGE]);
    }
}
