use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Axelar — validator-set + Amplifier GMP routing on Solana.
///
/// Solana program (mainnet, verified via Axelar's own contract-deployments
/// repo — <https://github.com/axelarnetwork/axelar-contract-deployments>,
/// `axelar-chains-config/info/mainnet.json`, `chains.solana.contracts.AxelarGateway.address`):
///   AxelarGateway: `gtwqvLL93XK7pC2eMvfGamqokvs19AytzaVhrL2iKiz`
///
/// 2026-07-26 correction: the previously-shipped address
/// (`AXLrkhuKFknA9oGPNRP9ARpyQbNCMEmxXEX3FMP1rEoF`) does not exist on
/// mainnet at all (`getAccountInfo` returns null) — it was never verified
/// before being enabled, per this file's own prior doc comment ("needs
/// verification before mainnet"). Confirmed via `getAccountInfo` against
/// the real address above: `executable: true`, owned by the upgradeable
/// BPF loader.
///
/// Real transaction evidence (fetched via `getTransaction` against a
/// Helius mainnet RPC, not invented) — the Gateway is invoked as a CPI from
/// the Interchain Token Service, never as a top-level instruction, so any
/// caller matching on program ID must check inner instructions too:
///   `ApproveMessage`  (inbound, treated as Mint)   — <https://solscan.io/tx/2TsHTUvAtnJz55RNJumL3Mwyn1tYEoxKMz7Z6X5tpXedG65siZKcfn6kG9QTope22WgeKo6mpx37V6C7ZNoREYhJ>
///   `CallContract`    (outbound, treated as Burn)  — <https://solscan.io/tx/4zj9wvnTLqCKn94UHAFZqGSMvtNfeyfcg1kmtJKfVk5Szq2TBefCZoihU99W37D5KWkJqnLJMT7MaKNd6ZfN4Dne>
///   `VerifySignature`, `ValidateMessage`, `InitializePayloadVerificationSession`
///   are also real, observed instruction names on this program, but are
///   internal steps of the same inbound flow that `ApproveMessage` already
///   represents — not decoded as separate events, same as this adapter
///   already treated them (no behavior change there, only the address was
///   wrong).
pub struct AxelarAdapter;

const SOLANA_GATEWAY: &str = "gtwqvLL93XK7pC2eMvfGamqokvs19AytzaVhrL2iKiz";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0x4F4495243837681061C4743b74B3eEdf548D56A5",
    ),
    (
        ChainId::Arbitrum,
        "0xe432150cce91c13a887f7D836923d5597adD8E31",
    ),
    (ChainId::Base, "0xe432150cce91c13a887f7D836923d5597adD8E31"),
    (
        ChainId::Optimism,
        "0xe432150cce91c13a887f7D836923d5597adD8E31",
    ),
    (ChainId::Bnb, "0x304acf330bbE08d1e512eefaa92F6a57871fD895"),
    (
        ChainId::Polygon,
        "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8",
    ),
];

const CONTRACT_CALL_TOPIC: &str =
    "0x30ae6cc78c27e651745bf2ad08a11de83910ac1e347a52f7ac898c0fbef94dae";

impl BridgeAdapter for AxelarAdapter {
    fn id(&self) -> String {
        "axelar".to_string()
    }
    fn display_name(&self) -> &str {
        "Axelar"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_GATEWAY]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_GATEWAY {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Approve") || ix.starts_with("Execute") {
            BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("CallContract") || ix.starts_with("Send") {
            BridgeEventPayload::Burn {
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
        if topic0 != CONTRACT_CALL_TOPIC {
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

    /// Real transaction: https://solscan.io/tx/2TsHTUvAtnJz55RNJumL3Mwyn1tYEoxKMz7Z6X5tpXedG65siZKcfn6kG9QTope22WgeKo6mpx37V6C7ZNoREYhJ
    /// (fetched 2026-07-26 via getTransaction; Gateway invoked as a CPI, log_line as seen at that depth)
    #[test]
    fn decodes_real_approve_message_as_mint() {
        let adapter = AxelarAdapter;
        let ctx = SolanaLogContext {
            signature: "2TsHTUvAtnJz55RNJumL3Mwyn1tYEoxKMz7Z6X5tpXedG65siZKcfn6kG9QTope22WgeKo6mpx37V6C7ZNoREYhJ",
            slot: 435126530,
            program_id: SOLANA_GATEWAY,
            log_line: "Program log: Instruction: ApproveMessage",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
        assert_eq!(evt.bridge_id, "axelar");
    }

    /// Real transaction: https://solscan.io/tx/4zj9wvnTLqCKn94UHAFZqGSMvtNfeyfcg1kmtJKfVk5Szq2TBefCZoihU99W37D5KWkJqnLJMT7MaKNd6ZfN4Dne
    #[test]
    fn decodes_real_call_contract_as_burn() {
        let adapter = AxelarAdapter;
        let ctx = SolanaLogContext {
            signature: "4zj9wvnTLqCKn94UHAFZqGSMvtNfeyfcg1kmtJKfVk5Szq2TBefCZoihU99W37D5KWkJqnLJMT7MaKNd6ZfN4Dne",
            slot: 435126440,
            program_id: SOLANA_GATEWAY,
            log_line: "Program log: Instruction: CallContract",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Burn);
    }

    /// Real transaction: https://solscan.io/tx/3ZjtJS3mGgfXg6gWADPq7SQQcgbXnZNivyy8qxVs2cTCiK8TRUmCLz4nbZGUfn2VVtaYV7W41YiJCzeWyyGKfYrb
    /// VerifySignature is a real, observed instruction on this program, but is an internal
    /// verification step (not the approval/send boundary) — must not decode as an event.
    #[test]
    fn ignores_real_verify_signature_instruction() {
        let adapter = AxelarAdapter;
        let ctx = SolanaLogContext {
            signature: "3ZjtJS3mGgfXg6gWADPq7SQQcgbXnZNivyy8qxVs2cTCiK8TRUmCLz4nbZGUfn2VVtaYV7W41YiJCzeWyyGKfYrb",
            slot: 435126528,
            program_id: SOLANA_GATEWAY,
            log_line: "Program log: Instruction: VerifySignature",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = AxelarAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: ApproveMessage",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
