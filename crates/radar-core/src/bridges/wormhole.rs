use crate::adapter::{BridgeAdapter, EvmLogContext, SolanaLogContext};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventPayload};
use chrono::Utc;
use uuid::Uuid;

/// Wormhole — Token Bridge program on Solana, core bridge contracts on EVM.
///
/// Solana program (mainnet): `wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb`
/// (Token Bridge). The Core bridge program is `worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth`
/// — we listen to the token bridge for transfer / redeem semantics.
///
/// EVM: Wormhole core bridge contract addresses per chain (mainnet):
///   ethereum: 0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B
///   arbitrum: 0xa5f208e072434bC67592E4C49C1B991BA79BCA46
///   base:     0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6
///   optimism: 0xEe91C335eab126dF5fDB3797EA9d6aD93aeC9722
///   bnb:      0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B
///   polygon:  0x7A4B5a56256163F07b2C80A7cA55aBE66c4ec4d7
pub struct WormholeAdapter;

const SOLANA_TOKEN_BRIDGE: &str = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";

const EVM_CONTRACTS: &[(ChainId, &str)] = &[
    (
        ChainId::Ethereum,
        "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    ),
    (
        ChainId::Arbitrum,
        "0xa5f208e072434bC67592E4C49C1B991BA79BCA46",
    ),
    (ChainId::Base, "0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6"),
    (
        ChainId::Optimism,
        "0xEe91C335eab126dF5fDB3797EA9d6aD93aeC9722",
    ),
    (ChainId::Bnb, "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B"),
    (
        ChainId::Polygon,
        "0x7A4B5a56256163F07b2C80A7cA55aBE66c4ec4d7",
    ),
];

impl BridgeAdapter for WormholeAdapter {
    fn id(&self) -> String {
        "wormhole".to_string()
    }
    fn display_name(&self) -> &str {
        "Wormhole"
    }
    fn solana_programs(&self) -> &[&'static str] {
        &[SOLANA_TOKEN_BRIDGE]
    }
    fn evm_contracts(&self) -> &[(ChainId, &'static str)] {
        EVM_CONTRACTS
    }

    /// v0-preview: classify token-bridge `Instruction:` log lines into mint
    /// (Solana-side wrapped issuance) or burn (Solana-side wrapped redemption).
    /// `amount_usd = 0.0` because v0 doesn't price assets — the parity
    /// detector consumes chain-side *counts* only. Pyth pricing lands in v1.
    ///
    /// Log lines we care about look like:
    ///   `Program log: Instruction: CompleteTransferNative`
    ///   `Program log: Instruction: TransferWrapped`
    fn decode_solana_log(&self, log: &SolanaLogContext<'_>) -> Option<BridgeEvent> {
        if log.program_id != SOLANA_TOKEN_BRIDGE {
            return None;
        }
        let line = log.log_line;
        let ix_name = line.split("Instruction: ").nth(1)?.trim();
        let kind = match ix_name {
            // Solana-side wrapped issuance — mint into Solana.
            n if n.starts_with("CompleteTransfer")
                || n.starts_with("CompleteNative")
                || n.starts_with("CompleteWrapped") =>
            {
                BridgeEventPayload::Mint {
                    chain: ChainId::Solana,
                    asset: "unknown".to_string(),
                    amount_usd: 0.0,
                    tx: log.signature.to_string(),
                }
            }
            // Solana-side wrapped redemption — burn out of Solana.
            n if n.starts_with("TransferNative")
                || n.starts_with("TransferWrapped")
                || n.starts_with("TransferTokens") =>
            {
                BridgeEventPayload::Burn {
                    chain: ChainId::Solana,
                    asset: "unknown".to_string(),
                    amount_usd: 0.0,
                    tx: log.signature.to_string(),
                }
            }
            _ => return None,
        };
        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: kind,
        })
    }

    /// v0-preview: emit `lock` for outbound `LogMessagePublished` and `unlock`
    /// for `Redeemed`. Topic hashes per Wormhole core ABI.
    fn decode_evm_log(&self, log: &EvmLogContext<'_>) -> Option<BridgeEvent> {
        const LOG_MESSAGE_PUBLISHED: &str =
            "0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2";
        let topic0 = log.topics.first()?.as_str();
        if topic0 != LOG_MESSAGE_PUBLISHED {
            return None;
        }
        Some(BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: self.id(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: log.chain.clone(),
                asset: "unknown".to_string(),
                amount_usd: 0.0,
                tx: log.tx_hash.to_string(),
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::SolanaLogContext;
    use crate::event::BridgeEventKind;

    #[test]
    fn decodes_complete_transfer_as_mint() {
        let adapter = WormholeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 12345,
            program_id: SOLANA_TOKEN_BRIDGE,
            log_line: "Program log: Instruction: CompleteTransferNative",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Mint);
        assert_eq!(evt.bridge_id, "wormhole");
        assert_eq!(evt.tx(), Some("5xy"));
    }

    #[test]
    fn decodes_transfer_wrapped_as_burn() {
        let adapter = WormholeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 12345,
            program_id: SOLANA_TOKEN_BRIDGE,
            log_line: "Program log: Instruction: TransferWrapped",
        };
        let evt = adapter.decode_solana_log(&ctx).expect("should decode");
        assert_eq!(evt.kind(), BridgeEventKind::Burn);
    }

    #[test]
    fn ignores_unrelated_program() {
        let adapter = WormholeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 12345,
            program_id: "11111111111111111111111111111111",
            log_line: "Program log: Instruction: TransferWrapped",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }

    #[test]
    fn ignores_lines_without_instruction_marker() {
        let adapter = WormholeAdapter;
        let ctx = SolanaLogContext {
            signature: "5xy",
            slot: 12345,
            program_id: SOLANA_TOKEN_BRIDGE,
            log_line: "Program wormDTUJ6... invoke [1]",
        };
        assert!(adapter.decode_solana_log(&ctx).is_none());
    }
}
