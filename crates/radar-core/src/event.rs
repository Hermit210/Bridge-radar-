use crate::chain::ChainId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Canonical bridge identifier — slug used everywhere (DB, API, events, scores).
pub type BridgeId = String;

/// Discriminator stored alongside each event row.
///
/// Kept as a plain enum (not the data-carrying [`BridgeEvent`]) so SQL queries
/// can filter by event type without deserializing the payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeEventKind {
    Lock,
    Mint,
    Burn,
    Unlock,
    SignerChange,
    FrontendChange,
    OracleStale,
}

impl BridgeEventKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            BridgeEventKind::Lock => "lock",
            BridgeEventKind::Mint => "mint",
            BridgeEventKind::Burn => "burn",
            BridgeEventKind::Unlock => "unlock",
            BridgeEventKind::SignerChange => "signer_change",
            BridgeEventKind::FrontendChange => "frontend_change",
            BridgeEventKind::OracleStale => "oracle_stale",
        }
    }
}

/// The normalized event model — whitepaper §4.2.
///
/// Once a raw chain event has been turned into a `BridgeEvent`, no downstream
/// consumer cares whether it came from Solana logs or an Ethereum log filter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeEvent {
    pub id: Uuid,
    pub bridge_id: BridgeId,
    pub event_time: DateTime<Utc>,
    #[serde(flatten)]
    pub payload: BridgeEventPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BridgeEventPayload {
    Lock {
        chain: ChainId,
        asset: String,
        amount_usd: f64,
        tx: String,
    },
    Mint {
        chain: ChainId,
        asset: String,
        amount_usd: f64,
        tx: String,
    },
    Burn {
        chain: ChainId,
        asset: String,
        amount_usd: f64,
        tx: String,
    },
    Unlock {
        chain: ChainId,
        asset: String,
        amount_usd: f64,
        tx: String,
    },
    SignerChange {
        before: Vec<String>,
        after: Vec<String>,
        tx: String,
    },
    FrontendChange {
        region: String,
        old_hash: String,
        new_hash: String,
    },
    OracleStale {
        feed: String,
        last_update: DateTime<Utc>,
    },
}

impl BridgeEvent {
    pub fn kind(&self) -> BridgeEventKind {
        match self.payload {
            BridgeEventPayload::Lock { .. } => BridgeEventKind::Lock,
            BridgeEventPayload::Mint { .. } => BridgeEventKind::Mint,
            BridgeEventPayload::Burn { .. } => BridgeEventKind::Burn,
            BridgeEventPayload::Unlock { .. } => BridgeEventKind::Unlock,
            BridgeEventPayload::SignerChange { .. } => BridgeEventKind::SignerChange,
            BridgeEventPayload::FrontendChange { .. } => BridgeEventKind::FrontendChange,
            BridgeEventPayload::OracleStale { .. } => BridgeEventKind::OracleStale,
        }
    }

    pub fn chain(&self) -> Option<&ChainId> {
        match &self.payload {
            BridgeEventPayload::Lock { chain, .. }
            | BridgeEventPayload::Mint { chain, .. }
            | BridgeEventPayload::Burn { chain, .. }
            | BridgeEventPayload::Unlock { chain, .. } => Some(chain),
            _ => None,
        }
    }

    pub fn asset(&self) -> Option<&str> {
        match &self.payload {
            BridgeEventPayload::Lock { asset, .. }
            | BridgeEventPayload::Mint { asset, .. }
            | BridgeEventPayload::Burn { asset, .. }
            | BridgeEventPayload::Unlock { asset, .. } => Some(asset.as_str()),
            _ => None,
        }
    }

    pub fn amount_usd(&self) -> Option<f64> {
        match &self.payload {
            BridgeEventPayload::Lock { amount_usd, .. }
            | BridgeEventPayload::Mint { amount_usd, .. }
            | BridgeEventPayload::Burn { amount_usd, .. }
            | BridgeEventPayload::Unlock { amount_usd, .. } => Some(*amount_usd),
            _ => None,
        }
    }

    pub fn tx(&self) -> Option<&str> {
        match &self.payload {
            BridgeEventPayload::Lock { tx, .. }
            | BridgeEventPayload::Mint { tx, .. }
            | BridgeEventPayload::Burn { tx, .. }
            | BridgeEventPayload::Unlock { tx, .. }
            | BridgeEventPayload::SignerChange { tx, .. } => Some(tx.as_str()),
            _ => None,
        }
    }
}

/// Filter passed to `Storage::list_events`.
#[derive(Debug, Clone, Default)]
pub struct EventFilter {
    pub bridge_id: Option<BridgeId>,
    pub chain: Option<ChainId>,
    pub kind: Option<BridgeEventKind>,
    pub since: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_lock_event_through_json() {
        let evt = BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: "wormhole".to_string(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: ChainId::Ethereum,
                asset: "USDC".to_string(),
                amount_usd: 12_345.67,
                tx: "0xdead".to_string(),
            },
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"type\":\"lock\""));
        let back: BridgeEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.bridge_id, "wormhole");
        assert_eq!(back.kind(), BridgeEventKind::Lock);
        assert_eq!(back.chain(), Some(&ChainId::Ethereum));
    }

    #[test]
    fn signer_change_has_no_chain() {
        let evt = BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: "wormhole".to_string(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::SignerChange {
                before: vec!["a".into()],
                after: vec!["b".into()],
                tx: "0x1".into(),
            },
        };
        assert_eq!(evt.kind(), BridgeEventKind::SignerChange);
        assert!(evt.chain().is_none());
        assert!(evt.amount_usd().is_none());
    }
}
