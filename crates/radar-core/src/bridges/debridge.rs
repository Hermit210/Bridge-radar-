use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// deBridge — DLN (Decentralized Liquidity Network) cross-chain settlement.
///
/// Solana: `src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4` (DLN Source program;
/// destination is `dst5MGcFPoBeREFAA5E3tU5ij8m5uVYwkzkSAbsLbNo`). Verify the
/// destination program ID before mainnet enable.
///
/// EVM: DlnSource on each chain. Audited by Halborn / dWallet.
pub struct DebridgeAdapter;

const SOLANA_DLN_SRC: &str = "src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4";
const SOLANA_DLN_DST: &str = "dst5MGcFPoBeREFAA5E3tU5ij8m5uVYwkzkSAbsLbNo";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xeF4fB24aD0916217251F553c0596F8Edc630EB66",
    ),
    (
        ChainId::Arbitrum,
        "0xeF4fB24aD0916217251F553c0596F8Edc630EB66",
    ),
    (ChainId::Bnb, "0xeF4fB24aD0916217251F553c0596F8Edc630EB66"),
    (
        ChainId::Polygon,
        "0xeF4fB24aD0916217251F553c0596F8Edc630EB66",
    ),
];

impl BridgeAdapter for DebridgeAdapter {
    fn id(&self) -> String {
        "debridge".to_string()
    }
    fn display_name(&self) -> &str {
        "deBridge"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_DLN_SRC, SOLANA_DLN_DST]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match (log.program_id, ix) {
            (id, name) if id == SOLANA_DLN_DST && name.starts_with("FulfillOrder") => {
                BridgeEventPayload::Mint {
                    chain: ChainId::Solana,
                    asset: "unknown".into(),
                    amount_usd: 0.0,
                    tx: log.signature.into(),
                }
            }
            (id, name) if id == SOLANA_DLN_SRC && name.starts_with("CreateOrder") => {
                BridgeEventPayload::Burn {
                    chain: ChainId::Solana,
                    asset: "unknown".into(),
                    amount_usd: 0.0,
                    tx: log.signature.into(),
                }
            }
            _ => return None,
        };
        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: kind,
        })
    }

    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        // CreatedOrder topic on DlnSource — verify exact hash from ABI.
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
