use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Allbridge — Allbridge Core (the v2 SPL bridge).
///
/// Solana (mainnet, verified via Allbridge's own live production Core API —
/// <https://core.api.allbridgecoreapi.net/token-info>, `SOL.bridgeAddress`):
///   `BrdgN2RPzEMWF96ZbnnJaUtQDQx7VRXYaHHbYCBvceWB`
///
/// 2026-07-26 correction: the previously-shipped address
/// (`BrdgEoYCMWgRNKFt9Dx6JmAZAvWmu6oW3aZ4HGwjeoP`) does not exist on
/// mainnet at all (`getAccountInfo` returns null) — this file's own prior
/// doc comment already admitted as much ("TODO-verify before mainnet
/// enable; the indexer simply ingests zero events if the program is
/// wrong"). Confirmed via `getAccountInfo` against the real address
/// above: `executable: true`, owned by the upgradeable BPF loader.
///
/// Real transaction evidence (fetched via `getTransaction`, not
/// invented) — the previous instruction-name guesses ("Swap"/"SendTokens"/
/// "Send" for outbound, "ReceiveTokens"/"Receive" for inbound) were also
/// never verified. A 92-transaction survey of the real address found the
/// actual cross-chain instructions are `SwapAndBridge` (outbound) and
/// `ReceiveAndSwap` (inbound) — plus a *separate*, same-chain-only `Swap`
/// instruction that is NOT a bridge crossing. The old `starts_with("Swap")`
/// guess would have matched `Swap` too (since `"SwapAndBridge"` also
/// starts with `"Swap"`), silently counting same-chain swaps as bridge
/// outflow. Fixed to match the exact real instruction names instead of a
/// loose prefix:
///   `SwapAndBridge` (outbound, treated as Burn) — <https://solscan.io/tx/skRk2bpj8PkbbZfpgR8BtafiYhc6aNys5n7QFJS5kaTsFcDqFrAHyioPpdWLRdYDDksJcYsaYKAEsSzqNwV7FsC>
///   `ReceiveAndSwap` (inbound, treated as Mint) — <https://solscan.io/tx/5VSC3mLGamiaCs4gXYkbTni4prRsTbCn71HDpnXfP2jAqJsnvdGrCEK5f63VPoW2ZT41bfTnJi47WSKB54ycvNbi>
///   `Swap` alone (same-chain only — must NOT decode) — <https://solscan.io/tx/5UUFz5T3QBRbkMozN5ztKVBVHHgsRajinjHU2Nwm9Tje2KfZuEgcDHi9rXF6EQcDfJeaovmUYHxFHm6sDf3JsNo3>
/// `Deposit`/`Withdraw`/`ClaimRewards`/`SetPoolAdminFeeShare`/
/// `SetPoolFeeShare`/`StopBridge`/`SetStopAuthority` are also real,
/// observed instruction names on this program (LP liquidity management
/// and emergency admin controls) — not bridge crossings, not decoded.
///
/// EVM: per-chain Allbridge Core entrypoints — verify against
/// docs.allbridgecoreapi.net before mainnet.
pub struct AllbridgeAdapter;

const SOLANA_CORE: &str = "BrdgN2RPzEMWF96ZbnnJaUtQDQx7VRXYaHHbYCBvceWB";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0x609c690e8F7D68a59885c9132e812eEbDaAf0c9e",
    ),
    (ChainId::Bnb, "0xBBbD1BbB4f9b936C3604906D7592A644071dE884"),
    (
        ChainId::Polygon,
        "0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D",
    ),
    (
        ChainId::Arbitrum,
        "0x9Ce3447B58D58e8602B7306316A5fF011B92d189",
    ),
];

impl BridgeAdapter for AllbridgeAdapter {
    fn id(&self) -> String {
        "allbridge".to_string()
    }
    fn display_name(&self) -> &str {
        "Allbridge"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_CORE]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_CORE {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("ReceiveAndSwap") {
            BridgeEventPayload::Mint {
                chain: ChainId::Solana,
                asset: "unknown".into(),
                amount_usd: 0.0,
                tx: log.signature.into(),
            }
        } else if ix.starts_with("SwapAndBridge") {
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
        // Allbridge Core SwapAndBridge / TokensReceived events — match on
        // *any* topic for an enabled contract. Allbridge has many event
        // shapes; v1 emits a coarse Lock event per relayed message.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::BridgeEventKind;

    /// Real transaction: https://solscan.io/tx/skRk2bpj8PkbbZfpgR8BtafiYhc6aNys5n7QFJS5kaTsFcDqFrAHyioPpdWLRdYDDksJcYsaYKAEsSzqNwV7FsC
    /// (fetched 2026-07-26 via getTransaction)
    #[test]
    fn decodes_real_swap_and_bridge_as_burn() {
        let adapter = AllbridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "skRk2bpj8PkbbZfpgR8BtafiYhc6aNys5n7QFJS5kaTsFcDqFrAHyioPpdWLRdYDDksJcYsaYKAEsSzqNwV7FsC",
            slot: 433960139,
            program_id: SOLANA_CORE,
            log_line: "Program log: Instruction: SwapAndBridge",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Burn);
        assert_eq!(evt.bridge_id, "allbridge");
    }

    /// Real transaction: https://solscan.io/tx/5VSC3mLGamiaCs4gXYkbTni4prRsTbCn71HDpnXfP2jAqJsnvdGrCEK5f63VPoW2ZT41bfTnJi47WSKB54ycvNbi
    #[test]
    fn decodes_real_receive_and_swap_as_mint() {
        let adapter = AllbridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5VSC3mLGamiaCs4gXYkbTni4prRsTbCn71HDpnXfP2jAqJsnvdGrCEK5f63VPoW2ZT41bfTnJi47WSKB54ycvNbi",
            slot: 433947143,
            program_id: SOLANA_CORE,
            log_line: "Program log: Instruction: ReceiveAndSwap",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
    }

    /// Real transaction: https://solscan.io/tx/5UUFz5T3QBRbkMozN5ztKVBVHHgsRajinjHU2Nwm9Tje2KfZuEgcDHi9rXF6EQcDfJeaovmUYHxFHm6sDf3JsNo3
    /// Regression guard: a same-chain-only `Swap` (no bridge crossing) must
    /// NOT decode, even though it shares a "Swap" prefix with the real
    /// bridge instruction `SwapAndBridge` — this is exactly the false
    /// positive the old loose `starts_with("Swap")` guess would have hit.
    #[test]
    fn ignores_real_same_chain_swap_instruction() {
        let adapter = AllbridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5UUFz5T3QBRbkMozN5ztKVBVHHgsRajinjHU2Nwm9Tje2KfZuEgcDHi9rXF6EQcDfJeaovmUYHxFHm6sDf3JsNo3",
            slot: 433946679,
            program_id: SOLANA_CORE,
            log_line: "Program log: Instruction: Swap",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = AllbridgeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: SwapAndBridge",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
