use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Coinbase Bridge — the Base↔Solana bridge (launched Dec 2025), jointly
/// secured by Coinbase and Chainlink CCIP node operators. Moves SOL/SPL
/// assets between Base (an Ethereum L2) and Solana.
///
/// Solana program (mainnet, verified via official Base docs —
/// <https://docs.base.org/base-chain/quickstart/base-solana-bridge>, and
/// independently confirmed executable via direct `getAccountInfo` RPC):
///   Bridge Program: `HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM`
///
/// Important discrepancy found and resolved during verification: the public
/// source at <https://github.com/base/bridge> (`solana/programs/bridge/src/lib.rs`)
/// has a different `declare_id!` value (`GaxAZQ3BSYjfG65e8mGnBnNpmhqRHDJ33aKEASHh3A3P`)
/// that does not exist on mainnet at all (`getAccountInfo` returns `null`) —
/// almost certainly stale scaffolding left in the `main` branch, not the
/// address actually deployed. The docs.base.org address is the one that's
/// real, executable, and actively receiving transactions; instruction names
/// below were pulled directly from real logs on *that* address, not assumed
/// from the mismatched source.
///
/// A second program, the optional Base Relayer (`g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9`,
/// "not part of the core bridge" per Base's own docs), exists for prepaying
/// Base gas fees — not decoded here since it's not part of the asset-transfer
/// path.
///
/// Real transaction evidence (fetched via `getTransaction` against
/// `api.mainnet-beta.solana.com`, not invented):
///   `BridgeSpl`    — <https://solscan.io/tx/3sefK5AomeWdWtjsV4hGrRNKCy37SEMDgZ6efXAoUuT1kPgh982H9axskUevViAieFK85xRvSagV4f2wdvoXzSHc>
///   `BridgeSol`    — <https://solscan.io/tx/2SqxyRK7yhk2nzrsxUANsFunhEK8C3THCVm9FEqQ3CVwHEKm8yqMTK2BgtZQ7qFA6rYqJHwstabkvpSNn9aJLFNg>
///   `RelayMessage` — <https://solscan.io/tx/4NdRJ3Ttxhp9PMdNowzyarp7nPiaz85VzeWq6F2h1MnCrSZwQFKgb7RuP7ZJRDu7wqgwSscnbvb3N8r7Cv2zrPnn>
pub struct BaseSolanaBridgeAdapter;

const SOLANA_BRIDGE: &str = "HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM";

impl BridgeAdapter for BaseSolanaBridgeAdapter {
    fn id(&self) -> String {
        "base-solana-bridge".to_string()
    }
    fn display_name(&self) -> &str {
        "Coinbase Bridge (Base-Solana)"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_BRIDGE]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Base-side Bridge contract is real (0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188,
        // per base/deployments/base_mainnet.json) but Base isn't one of our
        // configured EVM chains (crate::chain::ChainId) yet — left empty
        // rather than mapping it to the wrong chain.
        &[]
    }

    /// `bridge_sol` / `bridge_spl` (and the wrapped-token variants) lock
    /// assets into the Solana bridge program pending delivery on Base
    /// (outbound leg). `relay_message` executes a proven incoming message
    /// from Base — the mechanism by which assets actually arrive on Solana
    /// (inbound settlement). `prove_message` / `register_output_root` are
    /// state-root/fraud-proof bookkeeping, not transfers, and `pay_for_relay`
    /// is gas-fee payment — neither decoded here.
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_BRIDGE {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            n if n.starts_with("Bridge") => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "RelayMessage" => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/3sefK5AomeWdWtjsV4hGrRNKCy37SEMDgZ6efXAoUuT1kPgh982H9axskUevViAieFK85xRvSagV4f2wdvoXzSHc
    /// (fetched 2026-07-22 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_bridge_spl_as_lock() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "3sefK5AomeWdWtjsV4hGrRNKCy37SEMDgZ6efXAoUuT1kPgh982H9axskUevViAieFK85xRvSagV4f2wdvoXzSHc",
            slot: 0,
            program_id: SOLANA_BRIDGE,
            log_line: "Program log: Instruction: BridgeSpl",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "base-solana-bridge");
    }

    /// Real transaction: https://solscan.io/tx/2SqxyRK7yhk2nzrsxUANsFunhEK8C3THCVm9FEqQ3CVwHEKm8yqMTK2BgtZQ7qFA6rYqJHwstabkvpSNn9aJLFNg
    #[test]
    fn decodes_real_bridge_sol_as_lock() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "2SqxyRK7yhk2nzrsxUANsFunhEK8C3THCVm9FEqQ3CVwHEKm8yqMTK2BgtZQ7qFA6rYqJHwstabkvpSNn9aJLFNg",
            slot: 0,
            program_id: SOLANA_BRIDGE,
            log_line: "Program log: Instruction: BridgeSol",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
    }

    /// Real transaction: https://solscan.io/tx/4NdRJ3Ttxhp9PMdNowzyarp7nPiaz85VzeWq6F2h1MnCrSZwQFKgb7RuP7ZJRDu7wqgwSscnbvb3N8r7Cv2zrPnn
    #[test]
    fn decodes_real_relay_message_as_unlock() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "4NdRJ3Ttxhp9PMdNowzyarp7nPiaz85VzeWq6F2h1MnCrSZwQFKgb7RuP7ZJRDu7wqgwSscnbvb3N8r7Cv2zrPnn",
            slot: 0,
            program_id: SOLANA_BRIDGE,
            log_line: "Program log: Instruction: RelayMessage",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    /// Real transaction: https://solscan.io/tx/SqcsMUn1RgriKJLRfF62krccPk2QBpYLDLPab9JoWwEQ8uoGcE3ePsu9APhKFug7YkXTZagrrr6CjyBn4p9Gvcr
    /// — state-root proof bookkeeping, intentionally not decoded.
    #[test]
    fn ignores_prove_message_bookkeeping() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_BRIDGE,
            log_line: "Program log: Instruction: ProveMessage",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    /// Real transaction: https://solscan.io/tx/4wZwQUPsXoMDaacMs37yFfYDi8u1F2u2A5JKzZq8eKHnJVp8vhZRh6gGsEimg9a6jhbL5W2xztp288ArBELroE99
    /// — output-root registration (consensus bookkeeping), intentionally not decoded.
    #[test]
    fn ignores_register_output_root() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_BRIDGE,
            log_line: "Program log: Instruction: RegisterOutputRoot",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = BaseSolanaBridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: BridgeSol",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
