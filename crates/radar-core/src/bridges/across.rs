use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Across Protocol — intent-based bridge. Depositors lock funds into a
/// SpokePool on the origin chain; relayers front the equivalent amount to
/// the recipient on the destination chain immediately (`fill_relay`) and
/// are reimbursed later from the deposit pool via a signed root bundle.
///
/// Solana program (mainnet, verified via official source —
/// <https://github.com/across-protocol/contracts>,
/// `programs/svm-spoke/src/lib.rs`, `declare_id!`):
///   svm_spoke (SpokePool): `DLv3NggMiSaef97YCkew5xKUHDh13tVGZ7tydt3ZeAru`
///
/// Real transaction evidence (fetched via `getTransaction` against
/// `api.mainnet-beta.solana.com`, not invented):
///   `Deposit`   — <https://solscan.io/tx/23nhXy7vLKQCQBdgfLfmMKbrEzpETc673gD44Zegwu2e97g5Ube1SG6tJiMsDJafAgEZxDFTsNU2MQvmBozvhZNG>
///   `FillRelay` — <https://solscan.io/tx/MiaYRAoVukUQSMgLDNsVHbiUtphWHNCpr5hqyPwFDvXubmipZCHEcrgykCVY7L5VKDhiVaypsQwzqyWSz7uKocL>
///
/// The program also emits admin/settlement instructions (`ExecuteRelayerRefundLeaf`,
/// `RelayRootBundle`, `BridgeTokensToHubPool`, `IdlWrite`, ...) which showed
/// up far more often than user deposits/fills in a live sample — v1
/// deliberately only decodes `Deposit*` and `FillRelay`, the two user-facing
/// bridge actions, to avoid conflating relayer-refund accounting with actual
/// cross-chain transfers.
pub struct AcrossAdapter;

const SOLANA_SPOKE_POOL: &str = "DLv3NggMiSaef97YCkew5xKUHDh13tVGZ7tydt3ZeAru";

impl BridgeAdapter for AcrossAdapter {
    fn id(&self) -> String {
        "across".to_string()
    }
    fn display_name(&self) -> &str {
        "Across Protocol"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_SPOKE_POOL]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Across runs a SpokePool per EVM chain too, but no specific address
        // has been verified yet — left empty rather than guessed.
        &[]
    }

    /// `deposit` / `deposit_now` / `unsafe_deposit` lock funds into the
    /// Solana SpokePool (outbound bridge origin). `fill_relay` is a relayer
    /// releasing funds to the recipient on Solana (inbound settlement).
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_SPOKE_POOL {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            n if n.starts_with("Deposit") => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "FillRelay" => BridgeEventPayload::Unlock {
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

    fn decode_evm_log(&self, _log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::SolanaLogContext;
    use crate::event::BridgeEventKind;

    /// Real transaction: https://solscan.io/tx/23nhXy7vLKQCQBdgfLfmMKbrEzpETc673gD44Zegwu2e97g5Ube1SG6tJiMsDJafAgEZxDFTsNU2MQvmBozvhZNG
    /// (a Jupiter-style router calling Route then Deposit — fetched 2026-07-22
    /// via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_deposit_as_lock() {
        let adapter = AcrossAdapter;
        let ctx = SolanaLogContext {
            signature: "23nhXy7vLKQCQBdgfLfmMKbrEzpETc673gD44Zegwu2e97g5Ube1SG6tJiMsDJafAgEZxDFTsNU2MQvmBozvhZNG",
            slot: 0,
            program_id: SOLANA_SPOKE_POOL,
            log_line: "Program log: Instruction: Deposit",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "across");
        assert_eq!(
            evt.tx(),
            Some("23nhXy7vLKQCQBdgfLfmMKbrEzpETc673gD44Zegwu2e97g5Ube1SG6tJiMsDJafAgEZxDFTsNU2MQvmBozvhZNG")
        );
    }

    /// Real transaction: https://solscan.io/tx/MiaYRAoVukUQSMgLDNsVHbiUtphWHNCpr5hqyPwFDvXubmipZCHEcrgykCVY7L5VKDhiVaypsQwzqyWSz7uKocL
    #[test]
    fn decodes_real_fill_relay_as_unlock() {
        let adapter = AcrossAdapter;
        let ctx = SolanaLogContext {
            signature: "MiaYRAoVukUQSMgLDNsVHbiUtphWHNCpr5hqyPwFDvXubmipZCHEcrgykCVY7L5VKDhiVaypsQwzqyWSz7uKocL",
            slot: 0,
            program_id: SOLANA_SPOKE_POOL,
            log_line: "Program log: Instruction: FillRelay",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    /// Real transaction: https://solscan.io/tx/2gooVDoooRggMqFTD5kLSgLC3pQTqUXicx5MvN3Qr7CKwbSNG7hQ42Htqx51gEPtoMrzRUCQ4neZ4YKp7s1As86D
    /// — relayer-refund settlement, intentionally not decoded (see module docs).
    #[test]
    fn ignores_relayer_refund_settlement() {
        let adapter = AcrossAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_SPOKE_POOL,
            log_line: "Program log: Instruction: ExecuteRelayerRefundLeaf",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = AcrossAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: Deposit",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
