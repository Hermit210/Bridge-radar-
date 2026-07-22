use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Relay (relay.link) — general-purpose cross-chain depository/relay
/// protocol. Users deposit into a per-chain vault; an authorized allocator
/// signs `execute_transfer` requests to release funds (same chain or
/// elsewhere) to fulfill a relay.
///
/// Solana program (mainnet, verified via official source —
/// <https://github.com/relayprotocol/relay-settlement>,
/// `packages/depository/packages/solana-vm/programs/relay-depository`,
/// `declare_id!` + `Anchor.toml` `[programs.mainnet]`):
///   relay_depository: `99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2`
///
/// Two sibling programs exist in the same repo (`relay_forwarder`,
/// `deposit_address`) but their instruction sets haven't been verified
/// against real transactions yet, so v1 only decodes the depository.
///
/// Real transaction evidence (fetched via `getTransaction` against
/// `api.mainnet-beta.solana.com`, not invented):
///   `DepositToken`    — <https://solscan.io/tx/4zic5Ug7dEnUmewtH6FJjBuwzxgi1yY7pjPB772sWEXzdvymGkQqyn92swtWRGT9E5gpJhxwytQZh1KK6vEQycJn>
///   `DepositNative`   — <https://solscan.io/tx/2nUhgxSJMhD11pCBHiYSrDo7TSLJMk4k7drJxRAg9JPKkepgZ29fDzuUmrYC3J5w16ikM6hMbqQcY4cKrDNT2NRy>
///   `ExecuteTransfer` — <https://solscan.io/tx/38RuRqqWKeErmr7fgC3cUHNQ3z6awnn7my85wJ3aKVuVaNzJ9PgXpaFe35W1goKsdrXN3eLyTxWxPSJz4YFB2Mih>
pub struct RelayAdapter;

const SOLANA_DEPOSITORY: &str = "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2";

impl BridgeAdapter for RelayAdapter {
    fn id(&self) -> String {
        "relay".to_string()
    }
    fn display_name(&self) -> &str {
        "Relay"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_DEPOSITORY]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        // Relay deploys a depository per supported chain (80+ per their own
        // docs), but no specific EVM address has been verified yet — left
        // empty rather than guessed.
        &[]
    }

    /// `deposit_native` / `deposit_token` lock real assets into the Solana
    /// vault (outbound relay origin). `execute_transfer` is the
    /// allocator-authorized release from the vault (inbound settlement).
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_DEPOSITORY {
            return None;
        }
        let ix_name = log.log_line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            n if n.starts_with("DepositNative") || n.starts_with("DepositToken") => {
                BridgeEventPayload::Lock {
                    chain: ChainId::Solana,
                    asset: "unknown".to_string(),
                    amount_usd: 0.0,
                    tx: log.signature.to_string(),
                }
            }
            n if n.starts_with("ExecuteTransfer") => BridgeEventPayload::Unlock {
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

    /// Real transaction: https://solscan.io/tx/4zic5Ug7dEnUmewtH6FJjBuwzxgi1yY7pjPB772sWEXzdvymGkQqyn92swtWRGT9E5gpJhxwytQZh1KK6vEQycJn
    /// (fetched 2026-07-22 via getTransaction against api.mainnet-beta.solana.com)
    #[test]
    fn decodes_real_deposit_token_as_lock() {
        let adapter = RelayAdapter;
        let ctx = SolanaLogContext {
            signature: "4zic5Ug7dEnUmewtH6FJjBuwzxgi1yY7pjPB772sWEXzdvymGkQqyn92swtWRGT9E5gpJhxwytQZh1KK6vEQycJn",
            slot: 434525076,
            program_id: SOLANA_DEPOSITORY,
            log_line: "Program log: Instruction: DepositToken",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
        assert_eq!(evt.bridge_id, "relay");
        assert_eq!(
            evt.tx(),
            Some("4zic5Ug7dEnUmewtH6FJjBuwzxgi1yY7pjPB772sWEXzdvymGkQqyn92swtWRGT9E5gpJhxwytQZh1KK6vEQycJn")
        );
    }

    /// Real transaction: https://solscan.io/tx/2nUhgxSJMhD11pCBHiYSrDo7TSLJMk4k7drJxRAg9JPKkepgZ29fDzuUmrYC3J5w16ikM6hMbqQcY4cKrDNT2NRy
    #[test]
    fn decodes_real_deposit_native_as_lock() {
        let adapter = RelayAdapter;
        let ctx = SolanaLogContext {
            signature: "2nUhgxSJMhD11pCBHiYSrDo7TSLJMk4k7drJxRAg9JPKkepgZ29fDzuUmrYC3J5w16ikM6hMbqQcY4cKrDNT2NRy",
            slot: 0,
            program_id: SOLANA_DEPOSITORY,
            log_line: "Program log: Instruction: DepositNative",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Lock);
    }

    /// Real transaction: https://solscan.io/tx/38RuRqqWKeErmr7fgC3cUHNQ3z6awnn7my85wJ3aKVuVaNzJ9PgXpaFe35W1goKsdrXN3eLyTxWxPSJz4YFB2Mih
    #[test]
    fn decodes_real_execute_transfer_as_unlock() {
        let adapter = RelayAdapter;
        let ctx = SolanaLogContext {
            signature: "38RuRqqWKeErmr7fgC3cUHNQ3z6awnn7my85wJ3aKVuVaNzJ9PgXpaFe35W1goKsdrXN3eLyTxWxPSJz4YFB2Mih",
            slot: 0,
            program_id: SOLANA_DEPOSITORY,
            log_line: "Program log: Instruction: ExecuteTransfer",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Unlock);
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = RelayAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: DepositToken",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_unrelated_instruction() {
        // Real composite tx 2bHkY9aZokND7EWSYY3ErdXCqCPpaDANtppJj3gqEwiXZ6Cp3ocipV7D8RPxvQ6HNfz1mMPgiUj2bwjAscBmWvB4
        // includes Route/Swap/ForwardToken before DepositToken — those should not decode.
        let adapter = RelayAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 0,
            program_id: SOLANA_DEPOSITORY,
            log_line: "Program log: Instruction: ForwardToken",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
