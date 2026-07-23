use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Orderly Network — omnichain perpetuals/orderbook trading. Users deposit
/// collateral into a per-chain vault; Orderly Chain nets balances and
/// settlement/withdrawal instructions arrive back at each vault via
/// LayerZero messaging. Previously blocked (see `BRIDGE_DISCOVERY.md` pass
/// 1): the public GitHub repo (`OrderlyNetwork/solana-vault`) only declared
/// `[programs.devnet]`/`[programs.localnet]` in its `Anchor.toml`, with no
/// mainnet section. Orderly has since shipped to Solana mainnet.
///
/// Solana program (mainnet, verified from Orderly's own official docs —
/// <https://orderly.network/docs/build-on-omnichain/addresses>, "Solana-Vault"
/// row under the Mainnet table, cross-checked with two independent fetches
/// of the same page before being trusted):
///   Solana-Vault: `ErBmAD61mGFKvrFNaTJuxoPwqrS8GgtwtqJTJVjFWx9Q`
///
/// Confirmed `executable: true` via direct `getAccountInfo`, and genuinely
/// live — real transactions land every 10-15 minutes. DeFiLlama
/// independently tracks it as "Orderly Bridge" (slug `orderly-bridge`,
/// category "Bridge", ~$23.7M TVL, Solana listed among its chains).
///
/// Instruction names confirmed empirically from real mainnet transactions
/// (fetched via `getTransaction` against `api.mainnet-beta.solana.com`):
///   `DepositSol` — <https://solscan.io/tx/2fZqP12FepQA9Riv1mjkK66wGf8yW8iQmLbWYhAA4DKFDYtw1bhxDoXsbrA9qy2PbMvabCTbm1qaHe5rGQrkkWy1>
///   `Deposit`    — <https://solscan.io/tx/5oKqh3eXoNcUUsH1UnpuZwM5DK5wxGyEjKx2beVk6Z99sfHkY3PQZwvKfw5g2SKqmnj2729ve137qJZQZjRAUmeo>
///   `LzReceive`  — <https://solscan.io/tx/5mwHcygU1UhAYuvvSGdSiS7CGRh6r8V8qTNCvQChnYBthZb52hzmKmePzVSPZ5BeJbsSNcYE8L91kLsqdD6pQziD>
///     (this specific `LzReceive` call is confirmed to move real funds: its
///     logs show a nested SPL Token program invocation transferring tokens
///     out of the vault before completing — an empirically-observed
///     withdrawal, not assumed from the name alone.)
pub struct OrderlyAdapter;

const SOLANA_VAULT: &str = "ErBmAD61mGFKvrFNaTJuxoPwqrS8GgtwtqJTJVjFWx9Q";

impl BridgeAdapter for OrderlyAdapter {
    fn id(&self) -> String {
        "orderly".to_string()
    }
    fn display_name(&self) -> &str {
        "Orderly Network"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_VAULT]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Orderly's vault is deployed per-chain (Ethereum, Arbitrum, Base,
        // etc. per DeFiLlama), but no specific EVM contract address has been
        // independently RPC-verified yet — left empty rather than guessed.
        &[]
    }

    /// `DepositSol`/`Deposit` locks the user's collateral into the Solana
    /// vault (outbound leg — Orderly Chain nets the balance). `LzReceive`
    /// processes an inbound LayerZero message from Orderly Chain; when that
    /// message carries a withdrawal it releases the user's funds from the
    /// vault (inbound settlement) — confirmed against a real transaction
    /// that actually moves tokens, not assumed. `PreExecute`/`PostExecute`
    /// are bookkeeping around message execution, not transfers themselves.
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_VAULT {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            "Deposit" | "DepositSol" => BridgeEventPayload::Lock {
                chain: ChainId::Solana,
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.signature.to_string(),
            },
            "LzReceive" => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/2fZqP12FepQA9Riv1mjkK66wGf8yW8iQmLbWYhAA4DKFDYtw1bhxDoXsbrA9qy2PbMvabCTbm1qaHe5rGQrkkWy1
    /// (fetched 2026-07-23 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_deposit_sol_as_lock() {
        let adapter = OrderlyAdapter;
        let ctx = SolanaLogContext {
            signature: "2fZqP12FepQA9Riv1mjkK66wGf8yW8iQmLbWYhAA4DKFDYtw1bhxDoXsbrA9qy2PbMvabCTbm1qaHe5rGQrkkWy1",
            slot: 0,
            program_id: SOLANA_VAULT,
            log_line: "Program log: Instruction: DepositSol",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "orderly");
        assert_eq!(
            evt.tx(),
            Some("2fZqP12FepQA9Riv1mjkK66wGf8yW8iQmLbWYhAA4DKFDYtw1bhxDoXsbrA9qy2PbMvabCTbm1qaHe5rGQrkkWy1")
        );
    }

    /// Real transaction: https://solscan.io/tx/5oKqh3eXoNcUUsH1UnpuZwM5DK5wxGyEjKx2beVk6Z99sfHkY3PQZwvKfw5g2SKqmnj2729ve137qJZQZjRAUmeo
    #[test]
    fn decodes_real_deposit_as_lock() {
        let adapter = OrderlyAdapter;
        let ctx = SolanaLogContext {
            signature: "5oKqh3eXoNcUUsH1UnpuZwM5DK5wxGyEjKx2beVk6Z99sfHkY3PQZwvKfw5g2SKqmnj2729ve137qJZQZjRAUmeo",
            slot: 0,
            program_id: SOLANA_VAULT,
            log_line: "Program log: Instruction: Deposit",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
    }

    /// Real transaction: https://solscan.io/tx/5mwHcygU1UhAYuvvSGdSiS7CGRh6r8V8qTNCvQChnYBthZb52hzmKmePzVSPZ5BeJbsSNcYE8L91kLsqdD6pQziD
    #[test]
    fn decodes_real_lz_receive_as_unlock() {
        let adapter = OrderlyAdapter;
        let ctx = SolanaLogContext {
            signature: "5mwHcygU1UhAYuvvSGdSiS7CGRh6r8V8qTNCvQChnYBthZb52hzmKmePzVSPZ5BeJbsSNcYE8L91kLsqdD6pQziD",
            slot: 0,
            program_id: SOLANA_VAULT,
            log_line: "Program log: Instruction: LzReceive",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    #[test]
    fn ignores_pre_execute_bookkeeping() {
        let adapter = OrderlyAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_VAULT,
            log_line: "Program log: Instruction: PreExecute",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = OrderlyAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: Deposit",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
