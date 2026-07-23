use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Atomiq Exchange (formerly SolLightning) — trustless Bitcoin <-> Solana
/// swaps using submarine swaps + an on-chain Bitcoin SPV light client (no
/// wrapped assets, no custodian, no liquidity pool). Contracts audited by
/// Ackee Blockchain & CSC and immutably deployed (no upgrade authority).
///
/// Solana program (mainnet, verified straight from the project's own GitHub
/// source — <https://github.com/adambor/SolLightning-program>, `Anchor.toml`,
/// `[programs.mainnet]` section):
///   swap_program: `4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM`
///
/// Confirmed `executable: true` via direct `getAccountInfo` against
/// `api.mainnet-beta.solana.com`.
///
/// Instruction names confirmed empirically from real mainnet transactions
/// (not from docs, which don't publish the program ID) — fetched via
/// `getTransaction` against `api.mainnet-beta.solana.com`:
///   `OffererInitializePayIn` — <https://solscan.io/tx/5gQMnNH35Fxe1SgsYqzDwkBLvmqtFkPcys8jkHMpxdbcw1xv7ooKq6YVVumvNZJqzHpdq4gDjq1evmAQ2Lw6NHrN>
///   `ClaimerClaim`           — <https://solscan.io/tx/jU8CLgWqC2hP81KPFAC4APywP4bPKNSMuAc7AhMRtgyzpTJGW19PWsVsTsXMyYtfAJSygK94eQ8mZHLTK8pBGW1>
///   `ClaimerClaimPayOut`     — <https://solscan.io/tx/YkntN5ZU2bn7FAfvFTpNMELghgxk45usF6iqYtDg34D96j6YG2t8BHDPmQQjb2UXJpDH4hhMTUvhBopF1zS7jzW>
///   `OffererRefund`          — <https://solscan.io/tx/3zTVvoUHAYfSd4RyjqAZFVTrGZCCi1ZrkomGa6kzRhbRTi3oeUyKEWYLdvry5su5bFJVcTJVXeVBp1qry9Mhvxm8>
pub struct AtomiqAdapter;

const SWAP_PROGRAM: &str = "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM";

impl BridgeAdapter for AtomiqAdapter {
    fn id(&self) -> String {
        "atomiq".to_string()
    }
    fn display_name(&self) -> &str {
        "Atomiq Exchange"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SWAP_PROGRAM]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Atomiq's primary corridor is Bitcoin <-> Solana; no EVM contract
        // address has been verified yet — left empty rather than guessed.
        &[]
    }

    /// `OffererInitialize`/`OffererInitializePayIn` locks funds into a PDA
    /// vault on Solana pending the counterparty revealing the Bitcoin-side
    /// payment proof (outbound leg). `ClaimerClaim`/`ClaimerClaimPayOut`
    /// releases those funds once the swap is proven (inbound settlement).
    /// `OffererRefund` returns funds to the *same* party when a swap expires
    /// unclaimed — not a cross-chain transfer, so deliberately not decoded
    /// (same reasoning as Garden's excluded `Refund`). `WriteData`/`InitData`
    /// are auxiliary bookkeeping (staging the BTC proof data before claim),
    /// not transfer events either.
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SWAP_PROGRAM {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            "OffererInitialize" | "OffererInitializePayIn" => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "ClaimerClaim" | "ClaimerClaimPayOut" => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/5gQMnNH35Fxe1SgsYqzDwkBLvmqtFkPcys8jkHMpxdbcw1xv7ooKq6YVVumvNZJqzHpdq4gDjq1evmAQ2Lw6NHrN
    /// (fetched 2026-07-23 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_offerer_initialize_pay_in_as_lock() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "5gQMnNH35Fxe1SgsYqzDwkBLvmqtFkPcys8jkHMpxdbcw1xv7ooKq6YVVumvNZJqzHpdq4gDjq1evmAQ2Lw6NHrN",
            slot: 0,
            program_id: SWAP_PROGRAM,
            log_line: "Program log: Instruction: OffererInitializePayIn",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "atomiq");
        assert_eq!(
            evt.tx(),
            Some("5gQMnNH35Fxe1SgsYqzDwkBLvmqtFkPcys8jkHMpxdbcw1xv7ooKq6YVVumvNZJqzHpdq4gDjq1evmAQ2Lw6NHrN")
        );
    }

    /// Real transaction: https://solscan.io/tx/jU8CLgWqC2hP81KPFAC4APywP4bPKNSMuAc7AhMRtgyzpTJGW19PWsVsTsXMyYtfAJSygK94eQ8mZHLTK8pBGW1
    #[test]
    fn decodes_real_claimer_claim_as_unlock() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "jU8CLgWqC2hP81KPFAC4APywP4bPKNSMuAc7AhMRtgyzpTJGW19PWsVsTsXMyYtfAJSygK94eQ8mZHLTK8pBGW1",
            slot: 0,
            program_id: SWAP_PROGRAM,
            log_line: "Program log: Instruction: ClaimerClaim",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    /// Real transaction: https://solscan.io/tx/YkntN5ZU2bn7FAfvFTpNMELghgxk45usF6iqYtDg34D96j6YG2t8BHDPmQQjb2UXJpDH4hhMTUvhBopF1zS7jzW
    #[test]
    fn decodes_real_claimer_claim_pay_out_as_unlock() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "YkntN5ZU2bn7FAfvFTpNMELghgxk45usF6iqYtDg34D96j6YG2t8BHDPmQQjb2UXJpDH4hhMTUvhBopF1zS7jzW",
            slot: 0,
            program_id: SWAP_PROGRAM,
            log_line: "Program log: Instruction: ClaimerClaimPayOut",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    /// Real transaction: https://solscan.io/tx/3zTVvoUHAYfSd4RyjqAZFVTrGZCCi1ZrkomGa6kzRhbRTi3oeUyKEWYLdvry5su5bFJVcTJVXeVBp1qry9Mhvxm8
    #[test]
    fn ignores_offerer_refund_not_a_cross_chain_transfer() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "3zTVvoUHAYfSd4RyjqAZFVTrGZCCi1ZrkomGa6kzRhbRTi3oeUyKEWYLdvry5su5bFJVcTJVXeVBp1qry9Mhvxm8",
            slot: 0,
            program_id: SWAP_PROGRAM,
            log_line: "Program log: Instruction: OffererRefund",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_auxiliary_write_data_bookkeeping() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SWAP_PROGRAM,
            log_line: "Program log: Instruction: WriteData",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = AtomiqAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: OffererInitialize",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
