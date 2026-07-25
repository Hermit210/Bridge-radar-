use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Mayan — Swift solver-based settlement (auctioneer + solver model).
///
/// Solana solver settlement program (mainnet, verified via Mayan's own
/// published SDK — <https://github.com/mayan-finance/swap-sdk>,
/// `src/addresses.ts`, `SWIFT_V2_PROGRAM_ID`):
///   `mayan34VedncxdK2XobtvWFDXQASUTBXhUVzt2kKgny`
///
/// 2026-07-26 correction: the previously-shipped address
/// (`MAyANxBRcqRXaPfWoZyURiE9PyuYDxoR1dbW2hkfjxR` — a plausible-looking
/// vanity string, but never a real deployed program) does not exist on
/// mainnet at all (`getAccountInfo` returns null); this file's own prior
/// doc comment already flagged it as unverified ("Verify before mainnet
/// enable"). Mayan actually runs several distinct Solana programs
/// (`MAYAN_PROGRAM_ID` legacy swap, `MCTP_PROGRAM_ID`, `SWIFT_PROGRAM_ID`
/// v1, `SWIFT_V2_PROGRAM_ID`) — v2 was picked because it's both the
/// current flagship "Swift" solver/auction product this adapter's own doc
/// comment describes, and the most recently active of the candidates
/// checked. Confirmed via `getAccountInfo`: `executable: true`, owned by
/// the upgradeable BPF loader.
///
/// Real transaction evidence (fetched via `getTransaction`, not
/// invented) — the existing `Settle`/`Fulfill` instruction-name guesses
/// turned out to be real instruction names on this program (only the
/// address was wrong):
///   `Settle`   — <https://solscan.io/tx/3kjyvn9w1MpLafzgm1YUQWdh5nd3MY6HxVzwvEZqzn4QEdfpPYfRo96FeuiHBmyFpbCF9CiD61tdtJXNdh6tbouj>
///   `Fulfill`  — <https://solscan.io/tx/piHXcNmtkM3anwAcJZdekZ4Q83r4KCYksp5yGXJQLZMKYJYraPP8fQNTYxqdX48UVogWppXnm7RJCe5dmFDG3kg>
/// `InitOrder`/`RegisterOrder`/`SetAuctionWinnerIr`/`Unlock`/`Close` are
/// also real, observed instruction names on this program (order
/// lifecycle / auction bookkeeping), but aren't the settlement-complete
/// boundary `Settle`/`Fulfill` represent — not decoded, same as before.
pub struct MayanAdapter;

const SOLANA_SOLVER: &str = "mayan34VedncxdK2XobtvWFDXQASUTBXhUVzt2kKgny";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C",
    ),
    (
        ChainId::Arbitrum,
        "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C",
    ),
    (ChainId::Base, "0xF18f923480dC144326e6C65d4F3D47Aa459bb41C"),
];

impl BridgeAdapter for MayanAdapter {
    fn id(&self) -> String {
        "mayan".to_string()
    }
    fn display_name(&self) -> &str {
        "Mayan"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_SOLVER]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_SOLVER {
            return None;
        }
        let ix = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = if ix.starts_with("Settle") || ix.starts_with("Fulfill") {
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

    /// Real transaction: https://solscan.io/tx/3kjyvn9w1MpLafzgm1YUQWdh5nd3MY6HxVzwvEZqzn4QEdfpPYfRo96FeuiHBmyFpbCF9CiD61tdtJXNdh6tbouj
    /// (fetched 2026-07-26 via getTransaction)
    #[test]
    fn decodes_real_settle_as_mint() {
        let adapter = MayanAdapter;
        let ctx = SolanaLogContext {
            signature: "3kjyvn9w1MpLafzgm1YUQWdh5nd3MY6HxVzwvEZqzn4QEdfpPYfRo96FeuiHBmyFpbCF9CiD61tdtJXNdh6tbouj",
            slot: 435204696,
            program_id: SOLANA_SOLVER,
            log_line: "Program log: Instruction: Settle",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
        assert_eq!(evt.bridge_id, "mayan");
    }

    /// Real transaction: https://solscan.io/tx/piHXcNmtkM3anwAcJZdekZ4Q83r4KCYksp5yGXJQLZMKYJYraPP8fQNTYxqdX48UVogWppXnm7RJCe5dmFDG3kg
    #[test]
    fn decodes_real_fulfill_as_mint() {
        let adapter = MayanAdapter;
        let ctx = SolanaLogContext {
            signature: "piHXcNmtkM3anwAcJZdekZ4Q83r4KCYksp5yGXJQLZMKYJYraPP8fQNTYxqdX48UVogWppXnm7RJCe5dmFDG3kg",
            slot: 435204696,
            program_id: SOLANA_SOLVER,
            log_line: "Program log: Instruction: Fulfill",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
    }

    /// Real transaction: https://solscan.io/tx/tuabZqP2DhzSgoWLKJbFCvBPf6x7MXimE2DpuYw5u94rAr4anQgkEeDh9nKVhdKg3DgHDYPLEvoTq36jSkTkTq2
    /// InitOrder is a real, observed instruction — order setup, not settlement — must not decode.
    #[test]
    fn ignores_real_init_order_instruction() {
        let adapter = MayanAdapter;
        let ctx = SolanaLogContext {
            signature: "tuabZqP2DhzSgoWLKJbFCvBPf6x7MXimE2DpuYw5u94rAr4anQgkEeDh9nKVhdKg3DgHDYPLEvoTq36jSkTkTq2",
            slot: 435204668,
            program_id: SOLANA_SOLVER,
            log_line: "Program log: Instruction: InitOrder",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = MayanAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: Settle",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
