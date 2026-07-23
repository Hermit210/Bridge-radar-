use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// rhino.fi — non-custodial cross-chain bridge (formerly DeversiFi), moving
/// assets between Solana and 35+ EVM/L2 chains via a shared deposit/withdraw
/// contract, with routing so transfers land near 1:1 with minimal price
/// impact.
///
/// Solana program (mainnet, verified from rhino.fi's own official docs —
/// <https://docs.rhino.fi/general/contract-addresses>, "Solana" row,
/// cross-checked with two independent fetches of the same page before being
/// trusted):
///   bridge program: `FCW1uBM3pZ7fQWvEL9sxTe4fNiH41bu9DWX4ErTZ6aMq`
///
/// Confirmed `executable: true` via direct `getAccountInfo` against
/// `api.mainnet-beta.solana.com`. The docs page doesn't publish an
/// instruction reference, so `DepositWithId`/`Withdraw` were confirmed
/// empirically from real, very recent mainnet transactions (fetched via
/// `getTransaction`):
///   `DepositWithId` — <https://solscan.io/tx/fCunQ5EXoF9fnCc9c8P7Lof1Sa5tWMfYUwUTLG2ESig52qgkrZ7JY1Yy8NHWgbnbpK7Wf4hPnEsziwEPPTpwwdb>
///   `Withdraw`      — <https://solscan.io/tx/4aqZ6GbmeNosRFcyeSizJo129ntzcmrgvBfedSjR3BqJxhpQFtsXZP5ajFewAKMrKyYrHxNibFKQBR1yumXVYE4u>
pub struct RhinoFiAdapter;

const BRIDGE_PROGRAM: &str = "FCW1uBM3pZ7fQWvEL9sxTe4fNiH41bu9DWX4ErTZ6aMq";

impl BridgeAdapter for RhinoFiAdapter {
    fn id(&self) -> String {
        "rhinofi".to_string()
    }
    fn display_name(&self) -> &str {
        "rhino.fi"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[BRIDGE_PROGRAM]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // rhino.fi runs a contract per supported EVM chain (see
        // docs.rhino.fi/general/contract-addresses), but none has been
        // independently RPC-verified yet — left empty rather than guessed.
        &[]
    }

    /// `DepositWithId` locks the user's asset into the Solana-side bridge
    /// program pending relay to the destination chain (outbound leg).
    /// `Withdraw` releases a bridged asset to the recipient on Solana
    /// (inbound settlement).
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != BRIDGE_PROGRAM {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            "DepositWithId" => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "Withdraw" => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/fCunQ5EXoF9fnCc9c8P7Lof1Sa5tWMfYUwUTLG2ESig52qgkrZ7JY1Yy8NHWgbnbpK7Wf4hPnEsziwEPPTpwwdb
    /// (fetched 2026-07-23 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_deposit_with_id_as_lock() {
        let adapter = RhinoFiAdapter;
        let ctx = SolanaLogContext {
            signature: "fCunQ5EXoF9fnCc9c8P7Lof1Sa5tWMfYUwUTLG2ESig52qgkrZ7JY1Yy8NHWgbnbpK7Wf4hPnEsziwEPPTpwwdb",
            slot: 0,
            program_id: BRIDGE_PROGRAM,
            log_line: "Program log: Instruction: DepositWithId",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "rhinofi");
        assert_eq!(
            evt.tx(),
            Some("fCunQ5EXoF9fnCc9c8P7Lof1Sa5tWMfYUwUTLG2ESig52qgkrZ7JY1Yy8NHWgbnbpK7Wf4hPnEsziwEPPTpwwdb")
        );
    }

    /// Real transaction: https://solscan.io/tx/4aqZ6GbmeNosRFcyeSizJo129ntzcmrgvBfedSjR3BqJxhpQFtsXZP5ajFewAKMrKyYrHxNibFKQBR1yumXVYE4u
    #[test]
    fn decodes_real_withdraw_as_unlock() {
        let adapter = RhinoFiAdapter;
        let ctx = SolanaLogContext {
            signature: "4aqZ6GbmeNosRFcyeSizJo129ntzcmrgvBfedSjR3BqJxhpQFtsXZP5ajFewAKMrKyYrHxNibFKQBR1yumXVYE4u",
            slot: 0,
            program_id: BRIDGE_PROGRAM,
            log_line: "Program log: Instruction: Withdraw",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = RhinoFiAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: DepositWithId",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_instruction() {
        let adapter = RhinoFiAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: BRIDGE_PROGRAM,
            log_line: "Program log: Instruction: Initialize",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
