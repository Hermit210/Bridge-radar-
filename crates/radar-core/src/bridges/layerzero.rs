use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// LayerZero — generic OApp messaging via Endpoint V2.
///
/// Endpoint V2 is the single canonical contract per chain (deterministic
/// deployment). dApps build OApps on top; we listen at the endpoint level so
/// we capture every relayed message regardless of OApp.
///
/// Solana endpoint (mainnet, verified via LayerZero's own deployments
/// metadata API — <https://metadata.layerzero-api.com/v1/metadata/deployments>,
/// `solana` chainKey, `stage: "mainnet"`, `deployments[0].endpointV2.address`):
///   `76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6`
///
/// 2026-07-26 correction: the previously-shipped address
/// (`LZ1qZQR2QFhkHUkbq6jKTpnyHbECFuY5gSUVCY6F2HT`) does not exist on
/// mainnet at all (`getAccountInfo` returns null) — this file's own prior
/// doc comment already flagged it as unverified ("verify against
/// layerzero.network/docs before mainnet enable"), but it was seeded as
/// enabled in the bridge registry without that verification happening.
/// Confirmed via `getAccountInfo` against the real address above:
/// `executable: true`, owned by the upgradeable BPF loader.
///
/// Real transaction evidence (fetched via `getTransaction`, not invented) —
/// the guessed instruction names ("LzReceive"/"Receive" for inbound) were
/// also never verified and don't match what the real Endpoint emits. A
/// 40-transaction survey of the real address found: `Send` (outbound),
/// `Clear` (inbound delivery/consumption — the actual "message received"
/// boundary), and `InitVerify`/`Verify` (DVN proof-submission steps prior
/// to delivery, not the delivery itself):
///   `Send`  (outbound, treated as Burn)          — <https://solscan.io/tx/2zpxafN3cEuRLZsvdLdV66LZNaEBCjRSw1nnvntbAh4TN9kZ93LDPy6Pb67QQLS5Q6aWKdbKznfDyA3du6uy96bd>
///   `Clear` (inbound, treated as Mint)            — <https://solscan.io/tx/66UQqBe5EFJKh89DwzTuP7vwVucqR4LxEhDv3tynQU9gVrct35HbuFrcnLmzTw42UA55GMtZXquBjCef8vHTs47A>
///   `Verify`/`InitVerify` (not decoded — DVN step) — <https://solscan.io/tx/a2aM51i1skqDron6vX6tQ8yXsf2j2ZQZBfEigSVMja4whAk7izKuG2BbM8VSDxA1UtytwX9nhyPLoHjtceQt2hB>
pub struct LayerZeroAdapter;

const SOLANA_ENDPOINT: &str = "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    // Endpoint V2 — same address on every chain (deterministic deploy).
    (
        ChainId::Ethereum,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (
        ChainId::Arbitrum,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (ChainId::Base, "0x1a44076050125825900e736c501f859c50fE728c"),
    (
        ChainId::Optimism,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
    (ChainId::Bnb, "0x1a44076050125825900e736c501f859c50fE728c"),
    (
        ChainId::Polygon,
        "0x1a44076050125825900e736c501f859c50fE728c",
    ),
];

const PACKET_SENT_TOPIC: &str =
    "0x1ab700d4ced0c005b164c0f789fd09fcbb0156d4c2041b8a3bfbcd961cd1567f";

impl BridgeAdapter for LayerZeroAdapter {
    fn id(&self) -> String {
        "layerzero".to_string()
    }
    fn display_name(&self) -> &str {
        "LayerZero"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_ENDPOINT]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_ENDPOINT {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Send") {
            BridgeEventPayload::Burn {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("Clear") {
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
        let topic0 = log.topics.first()?.as_str();
        if topic0 != PACKET_SENT_TOPIC {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::BridgeEventKind;

    /// Real transaction: https://solscan.io/tx/2zpxafN3cEuRLZsvdLdV66LZNaEBCjRSw1nnvntbAh4TN9kZ93LDPy6Pb67QQLS5Q6aWKdbKznfDyA3du6uy96bd
    /// (fetched 2026-07-26 via getTransaction)
    #[test]
    fn decodes_real_send_as_burn() {
        let adapter = LayerZeroAdapter;
        let ctx = SolanaLogContext {
            signature: "2zpxafN3cEuRLZsvdLdV66LZNaEBCjRSw1nnvntbAh4TN9kZ93LDPy6Pb67QQLS5Q6aWKdbKznfDyA3du6uy96bd",
            slot: 435198393,
            program_id: SOLANA_ENDPOINT,
            log_line: "Program log: Instruction: Send",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Burn);
        assert_eq!(evt.bridge_id, "layerzero");
    }

    /// Real transaction: https://solscan.io/tx/66UQqBe5EFJKh89DwzTuP7vwVucqR4LxEhDv3tynQU9gVrct35HbuFrcnLmzTw42UA55GMtZXquBjCef8vHTs47A
    #[test]
    fn decodes_real_clear_as_mint() {
        let adapter = LayerZeroAdapter;
        let ctx = SolanaLogContext {
            signature: "66UQqBe5EFJKh89DwzTuP7vwVucqR4LxEhDv3tynQU9gVrct35HbuFrcnLmzTw42UA55GMtZXquBjCef8vHTs47A",
            slot: 435201068,
            program_id: SOLANA_ENDPOINT,
            log_line: "Program log: Instruction: Clear",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
    }

    /// Real transaction: https://solscan.io/tx/a2aM51i1skqDron6vX6tQ8yXsf2j2ZQZBfEigSVMja4whAk7izKuG2BbM8VSDxA1UtytwX9nhyPLoHjtceQt2hB
    /// Verify/InitVerify are real, observed DVN proof-submission steps — not the
    /// delivery boundary (`Clear` is) — must not decode as an event.
    #[test]
    fn ignores_real_verify_instruction() {
        let adapter = LayerZeroAdapter;
        let ctx = SolanaLogContext {
            signature: "a2aM51i1skqDron6vX6tQ8yXsf2j2ZQZBfEigSVMja4whAk7izKuG2BbM8VSDxA1UtytwX9nhyPLoHjtceQt2hB",
            slot: 435201058,
            program_id: SOLANA_ENDPOINT,
            log_line: "Program log: Instruction: Verify",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = LayerZeroAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: Send",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
