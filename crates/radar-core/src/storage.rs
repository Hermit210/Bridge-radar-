pub mod postgres;
pub mod sqlite;

use crate::event::{BridgeEvent, BridgeId, EventFilter};
use crate::health::{HealthComponents, HealthScore};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("unknown bridge: {0}")]
    UnknownBridge(BridgeId),
}

pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Debug, Clone)]
pub struct ParityState {
    pub bridge_id: BridgeId,
    pub asset: String,
    pub locked_origin_usd: f64,
    pub minted_solana_usd: f64,
    pub burned_solana_usd: f64,
    pub unlocked_origin_usd: f64,
    pub updated_at: DateTime<Utc>,
}

/// Storage abstraction. v0 ships a SQLite implementation; a Postgres+Timescale
/// impl plugs in by implementing the same trait.
#[async_trait]
pub trait Storage: Send + Sync {
    async fn insert_event(&self, event: &BridgeEvent) -> Result<()>;
    async fn list_events(&self, filter: &EventFilter) -> Result<Vec<BridgeEvent>>;

    async fn upsert_score(&self, score: &HealthScore) -> Result<()>;
    async fn latest_scores(&self) -> Result<Vec<HealthScore>>;
    async fn score_history(
        &self,
        bridge_id: &str,
        since: DateTime<Utc>,
    ) -> Result<Vec<HealthScore>>;

    async fn get_parity_state(&self, bridge_id: &str, asset: &str) -> Result<Option<ParityState>>;
    async fn upsert_parity_state(&self, state: &ParityState) -> Result<()>;

    /// Bridge slugs known to the store (seeded by migration / SQLite init).
    async fn list_bridges(&self) -> Result<Vec<BridgeRow>>;

    /// Returns 5-minute event counts for `bridge_id` between `since` and now,
    /// keyed by `floor(unix_seconds / 300)`. Used by the outflow z-score
    /// detector to assemble a baseline distribution.
    async fn event_count_buckets(&self, bridge_id: &str, since: DateTime<Utc>) -> Result<Vec<u32>>;
}

#[derive(Debug, Clone)]
pub struct BridgeRow {
    pub id: BridgeId,
    pub display_name: String,
    pub homepage: Option<String>,
    pub enabled: bool,
}

// Re-export both impls for ergonomics.
pub use postgres::PostgresStorage;
pub use sqlite::SqliteStorage;

/// Connect to whichever backend `url` points at — `sqlite://...` opens a
/// SqliteStorage and any other prefix is routed to PostgresStorage. Returns
/// the trait object so callers don't need to know which backend they got.
pub async fn connect_any(url: &str) -> Result<Box<dyn Storage>> {
    if url.starts_with("sqlite:") || url.starts_with("sqlite://") {
        Ok(Box::new(SqliteStorage::connect(url).await?))
    } else {
        Ok(Box::new(PostgresStorage::connect(url).await?))
    }
}

// Component breakdown shorthand used by scorer when constructing scores.
impl HealthComponents {
    pub fn weighted_score(&self) -> u8 {
        let raw = 100.0
            - 40.0 * self.parity_severity as f64
            - 25.0 * self.outflow_severity as f64
            - 15.0 * self.signer_recency as f64
            - 10.0 * self.frontend_recency as f64
            - 10.0 * self.oracle_staleness as f64;
        raw.clamp(0.0, 100.0).round() as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weighted_score_at_rest() {
        let c = HealthComponents::default();
        assert_eq!(c.weighted_score(), 100);
    }

    #[test]
    fn weighted_score_full_severity() {
        let c = HealthComponents {
            parity_severity: 1.0,
            outflow_severity: 1.0,
            signer_recency: 1.0,
            frontend_recency: 1.0,
            oracle_staleness: 1.0,
        };
        assert_eq!(c.weighted_score(), 0);
    }

    #[test]
    fn weighted_score_appendix_b_first_example() {
        // Whitepaper appendix B, healthy snapshot: parity 0.05, others 0.
        let c = HealthComponents {
            parity_severity: 0.05,
            ..Default::default()
        };
        assert_eq!(c.weighted_score(), 98);
    }

    #[test]
    fn weighted_score_appendix_b_red_example() {
        // parity 0.6, outflow 1.0, frontend 0.5 → 100 - 24 - 25 - 5 = 46
        let c = HealthComponents {
            parity_severity: 0.6,
            outflow_severity: 1.0,
            frontend_recency: 0.5,
            ..Default::default()
        };
        assert_eq!(c.weighted_score(), 46);
    }
}
