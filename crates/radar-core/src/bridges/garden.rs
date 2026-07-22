use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Garden Finance — Bitcoin-native cross-chain bridge using Hashed Timelock
/// Contracts (HTLCs) for trustless atomic swaps (no wrapped assets, no
/// liquidity pools). Solana is one of several supported chains alongside
/// Bitcoin, Ethereum, Arbitrum, Base, Starknet, Sui, Tron.
///
/// Solana program (mainnet, verified straight from Garden's own SDK source —
/// <https://github.com/gardenfi/garden.js>,
/// `packages/core/src/lib/constants.ts`, `solanaProgramAddress.mainnet`):
///   solana_native_swaps: `2bag6xpshpvPe7SJ9nSDLHpxqhEAoHPGpEkjNSv7gxoF`
///
/// Instruction names confirmed against official docs
/// (<https://docs.garden.finance/contracts/solana>): `initiate`, `redeem`,
/// `refund`, `instant_refund`.
///
/// Real transaction evidence (fetched via `getTransaction` against
/// `api.mainnet-beta.solana.com`, not invented):
///   `Initiate` — <https://solscan.io/tx/3brgy1WntmrQxu35bZfWpPavxWu5yUcYGHJw5U8fJGHKF8kTEcTwDHqQAQqSUSFKAE5KisNw6LpGBmuQ8CJGnu9N>
///   `Redeem`   — <https://solscan.io/tx/445xrD62LszYDbFjDHSe7wXichhkzeC57bEMThiXkbPkdNahSG3zzDhBCs6EFntKAbu7hNKeThNrkCBGKqeAAMhP>
pub struct GardenAdapter;

const SOLANA_NATIVE_SWAPS: &str = "2bag6xpshpvPe7SJ9nSDLHpxqhEAoHPGpEkjNSv7gxoF";

impl BridgeAdapter for GardenAdapter {
    fn id(&self) -> String {
        "garden".to_string()
    }
    fn display_name(&self) -> &str {
        "Garden Finance"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_NATIVE_SWAPS]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Garden runs an HTLC contract per supported EVM chain too, but no
        // specific address has been verified yet — left empty rather than guessed.
        &[]
    }

    /// `initiate` locks SOL into a PDA vault pending atomic-swap redemption
    /// (outbound leg of the swap). `redeem` releases it to the counterparty
    /// once the secret is revealed (inbound settlement). `refund` /
    /// `instant_refund` return funds to the *same* party when a swap fails —
    /// that's not a cross-chain transfer, so deliberately not decoded here
    /// (same reasoning as Across's excluded relayer-refund settlement).
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_NATIVE_SWAPS {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            "Initiate" => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "Redeem" => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/3brgy1WntmrQxu35bZfWpPavxWu5yUcYGHJw5U8fJGHKF8kTEcTwDHqQAQqSUSFKAE5KisNw6LpGBmuQ8CJGnu9N
    /// (fetched 2026-07-22 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_initiate_as_lock() {
        let adapter = GardenAdapter;
        let ctx = SolanaLogContext {
            signature: "3brgy1WntmrQxu35bZfWpPavxWu5yUcYGHJw5U8fJGHKF8kTEcTwDHqQAQqSUSFKAE5KisNw6LpGBmuQ8CJGnu9N",
            slot: 0,
            program_id: SOLANA_NATIVE_SWAPS,
            log_line: "Program log: Instruction: Initiate",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "garden");
        assert_eq!(
            evt.tx(),
            Some("3brgy1WntmrQxu35bZfWpPavxWu5yUcYGHJw5U8fJGHKF8kTEcTwDHqQAQqSUSFKAE5KisNw6LpGBmuQ8CJGnu9N")
        );
    }

    /// Real transaction: https://solscan.io/tx/445xrD62LszYDbFjDHSe7wXichhkzeC57bEMThiXkbPkdNahSG3zzDhBCs6EFntKAbu7hNKeThNrkCBGKqeAAMhP
    #[test]
    fn decodes_real_redeem_as_unlock() {
        let adapter = GardenAdapter;
        let ctx = SolanaLogContext {
            signature: "445xrD62LszYDbFjDHSe7wXichhkzeC57bEMThiXkbPkdNahSG3zzDhBCs6EFntKAbu7hNKeThNrkCBGKqeAAMhP",
            slot: 0,
            program_id: SOLANA_NATIVE_SWAPS,
            log_line: "Program log: Instruction: Redeem",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    #[test]
    fn ignores_refund_not_a_cross_chain_transfer() {
        let adapter = GardenAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_NATIVE_SWAPS,
            log_line: "Program log: Instruction: Refund",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = GardenAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: Initiate",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
