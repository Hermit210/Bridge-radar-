use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeId};

/// A bridge-specific decoder. Each supported bridge ships one of these and
/// the indexers iterate the registry to find which adapter handles a given
/// program / contract.
///
/// Decoders return `Option<BridgeEvent>`: `None` means "not relevant to this
/// adapter, skip." Errors are reserved for actually-malformed inputs that we
/// want a log line about.
pub trait BridgeAdapter: Send + Sync {
    fn id(&self) -> BridgeId;
    fn display_name(&self) -> &str;

    /// Solana program IDs (base58) this adapter watches.
    fn solana_programs(&self) -> &[&'static str] {
        &[]
    }

    /// (chain, hex-address) pairs this adapter watches on EVM.
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        &[]
    }

    /// Decode a Solana log line. Default impl: not handled.
    fn decode_solana_log(&self, _log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        None
    }

    /// Decode an EVM log. Default impl: not handled.
    fn decode_evm_log(&self, _log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        None
    }
}

#[derive(Debug, Clone)]
pub struct SolanaLogContext<'a> {
    pub signature: &'a str,
    pub slot: u64,
    pub program_id: &'a str,
    pub log_line: &'a str,
}

#[derive(Debug, Clone)]
pub struct EvmLogContext<'a> {
    pub chain: ChainId,
    pub block_number: u64,
    pub tx_hash: &'a str,
    pub address: &'a str,
    pub topics: &'a [String],
    pub data: &'a str,
}
