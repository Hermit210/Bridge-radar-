//! SQLite implementation of [`Storage`] for the v0 dev loop.
//!
//! Schema is created on connect via embedded DDL — no separate migrations
//! step. Logically equivalent to `migrations/0001_init.sql` (Postgres) but
//! uses SQLite types: `TEXT` timestamps stored as RFC 3339, `REAL` for
//! numerics, JSON kept as `TEXT`.

use super::{BridgeRow, ParityState, Result, Storage, StorageError};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventKind, EventFilter};
use crate::health::{HealthComponents, HealthScore};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;

const INIT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS bridges (
    id            TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    homepage      TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bridge_events (
    id          TEXT PRIMARY KEY,
    event_time  TEXT NOT NULL,
    bridge_id   TEXT NOT NULL REFERENCES bridges(id),
    event_type  TEXT NOT NULL,
    chain_id    TEXT,
    asset       TEXT,
    amount_usd  REAL,
    tx          TEXT,
    payload     TEXT NOT NULL,
    ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bridge_events_bridge_time_idx
    ON bridge_events (bridge_id, event_time DESC);
CREATE INDEX IF NOT EXISTS bridge_events_type_time_idx
    ON bridge_events (event_type, event_time DESC);

CREATE TABLE IF NOT EXISTS bridge_health_scores (
    bridge_id        TEXT NOT NULL REFERENCES bridges(id),
    computed_at      TEXT NOT NULL,
    score            INTEGER NOT NULL,
    parity_severity  REAL NOT NULL DEFAULT 0,
    outflow_severity REAL NOT NULL DEFAULT 0,
    signer_recency   REAL NOT NULL DEFAULT 0,
    frontend_recency REAL NOT NULL DEFAULT 0,
    oracle_staleness REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (bridge_id, computed_at)
);

CREATE TABLE IF NOT EXISTS parity_state (
    bridge_id           TEXT NOT NULL REFERENCES bridges(id),
    asset               TEXT NOT NULL,
    locked_origin_usd   REAL NOT NULL DEFAULT 0,
    minted_solana_usd   REAL NOT NULL DEFAULT 0,
    burned_solana_usd   REAL NOT NULL DEFAULT 0,
    unlocked_origin_usd REAL NOT NULL DEFAULT 0,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (bridge_id, asset)
);

INSERT OR IGNORE INTO bridges (id, display_name, homepage) VALUES
    ('wormhole',  'Wormhole',  'https://wormhole.com'),
    ('allbridge', 'Allbridge', 'https://allbridge.io'),
    ('debridge',  'deBridge',  'https://debridge.finance'),
    ('layerzero', 'LayerZero', 'https://layerzero.network'),
    ('mayan',     'Mayan',     'https://mayan.finance'),
    ('portal',    'Portal',    'https://portalbridge.com'),
    ('axelar',    'Axelar',    'https://axelar.network');
"#;

#[derive(Clone)]
pub struct SqliteStorage {
    pool: SqlitePool,
}

impl SqliteStorage {
    /// Connect to the SQLite DB at `url` (e.g. `sqlite://./data/radar.db`),
    /// creating the file + schema if they don't exist.
    pub async fn connect(url: &str) -> Result<Self> {
        let opts = SqliteConnectOptions::from_str(url)?
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .busy_timeout(std::time::Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(opts)
            .await?;

        // Apply schema. Each statement runs separately so SQLite is happy.
        for stmt in INIT_SQL.split(';') {
            let s = stmt.trim();
            if s.is_empty() {
                continue;
            }
            sqlx::query(s).execute(&pool).await?;
        }

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

#[async_trait]
impl Storage for SqliteStorage {
    async fn insert_event(&self, event: &BridgeEvent) -> Result<()> {
        let payload = serde_json::to_string(&event.payload)?;
        sqlx::query(
            r#"INSERT OR IGNORE INTO bridge_events
               (id, event_time, bridge_id, event_type, chain_id, asset, amount_usd, tx, payload)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(event.id.to_string())
        .bind(event.event_time.to_rfc3339())
        .bind(&event.bridge_id)
        .bind(event.kind().as_str())
        .bind(event.chain().map(|c| c.as_str().to_string()))
        .bind(event.asset())
        .bind(event.amount_usd())
        .bind(event.tx())
        .bind(payload)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_events(&self, filter: &EventFilter) -> Result<Vec<BridgeEvent>> {
        let limit = filter.limit.unwrap_or(100).min(1000) as i64;
        let mut sql =
            String::from("SELECT id, event_time, bridge_id, payload FROM bridge_events WHERE 1=1");
        if filter.bridge_id.is_some() {
            sql.push_str(" AND bridge_id = ?");
        }
        if filter.kind.is_some() {
            sql.push_str(" AND event_type = ?");
        }
        if filter.chain.is_some() {
            sql.push_str(" AND chain_id = ?");
        }
        if filter.since.is_some() {
            sql.push_str(" AND event_time >= ?");
        }
        sql.push_str(" ORDER BY event_time DESC LIMIT ?");

        let mut q = sqlx::query(&sql);
        if let Some(b) = &filter.bridge_id {
            q = q.bind(b);
        }
        if let Some(k) = &filter.kind {
            q = q.bind(k.as_str());
        }
        if let Some(c) = &filter.chain {
            q = q.bind(c.as_str().to_string());
        }
        if let Some(s) = filter.since {
            q = q.bind(s.to_rfc3339());
        }
        q = q.bind(limit);

        let rows = q.fetch_all(&self.pool).await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let id_str: String = row.try_get("id")?;
            let event_time_str: String = row.try_get("event_time")?;
            let bridge_id: String = row.try_get("bridge_id")?;
            let payload_str: String = row.try_get("payload")?;
            let payload = serde_json::from_str(&payload_str)?;
            let event_time = DateTime::parse_from_rfc3339(&event_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|e| StorageError::Database(sqlx::Error::Decode(Box::new(e))))?;
            out.push(BridgeEvent {
                id: uuid::Uuid::parse_str(&id_str)
                    .map_err(|e| StorageError::Database(sqlx::Error::Decode(Box::new(e))))?,
                event_time,
                bridge_id,
                payload,
            });
        }
        Ok(out)
    }

    async fn upsert_score(&self, score: &HealthScore) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO bridge_health_scores
                 (bridge_id, computed_at, score,
                  parity_severity, outflow_severity, signer_recency,
                  frontend_recency, oracle_staleness)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(bridge_id, computed_at) DO UPDATE SET
                  score = excluded.score,
                  parity_severity = excluded.parity_severity,
                  outflow_severity = excluded.outflow_severity,
                  signer_recency = excluded.signer_recency,
                  frontend_recency = excluded.frontend_recency,
                  oracle_staleness = excluded.oracle_staleness"#,
        )
        .bind(&score.bridge_id)
        .bind(score.computed_at.to_rfc3339())
        .bind(score.score as i64)
        .bind(score.components.parity_severity as f64)
        .bind(score.components.outflow_severity as f64)
        .bind(score.components.signer_recency as f64)
        .bind(score.components.frontend_recency as f64)
        .bind(score.components.oracle_staleness as f64)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn latest_scores(&self) -> Result<Vec<HealthScore>> {
        let rows = sqlx::query(
            r#"SELECT s.bridge_id, s.computed_at, s.score,
                      s.parity_severity, s.outflow_severity, s.signer_recency,
                      s.frontend_recency, s.oracle_staleness
                 FROM bridge_health_scores s
                 INNER JOIN (
                     SELECT bridge_id, MAX(computed_at) AS m
                       FROM bridge_health_scores GROUP BY bridge_id
                 ) latest ON latest.bridge_id = s.bridge_id AND latest.m = s.computed_at"#,
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_score).collect()
    }

    async fn score_history(
        &self,
        bridge_id: &str,
        since: DateTime<Utc>,
    ) -> Result<Vec<HealthScore>> {
        let rows = sqlx::query(
            r#"SELECT bridge_id, computed_at, score,
                      parity_severity, outflow_severity, signer_recency,
                      frontend_recency, oracle_staleness
                 FROM bridge_health_scores
                 WHERE bridge_id = ? AND computed_at >= ?
                 ORDER BY computed_at ASC"#,
        )
        .bind(bridge_id)
        .bind(since.to_rfc3339())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_score).collect()
    }

    async fn get_parity_state(&self, bridge_id: &str, asset: &str) -> Result<Option<ParityState>> {
        let row = sqlx::query(
            r#"SELECT bridge_id, asset,
                      locked_origin_usd, minted_solana_usd,
                      burned_solana_usd, unlocked_origin_usd, updated_at
                 FROM parity_state WHERE bridge_id = ? AND asset = ?"#,
        )
        .bind(bridge_id)
        .bind(asset)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else { return Ok(None) };
        let updated_str: String = row.try_get("updated_at")?;
        Ok(Some(ParityState {
            bridge_id: row.try_get("bridge_id")?,
            asset: row.try_get("asset")?,
            locked_origin_usd: row.try_get("locked_origin_usd")?,
            minted_solana_usd: row.try_get("minted_solana_usd")?,
            burned_solana_usd: row.try_get("burned_solana_usd")?,
            unlocked_origin_usd: row.try_get("unlocked_origin_usd")?,
            updated_at: parse_rfc3339(&updated_str)?,
        }))
    }

    async fn upsert_parity_state(&self, state: &ParityState) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO parity_state
                 (bridge_id, asset, locked_origin_usd, minted_solana_usd,
                  burned_solana_usd, unlocked_origin_usd, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(bridge_id, asset) DO UPDATE SET
                  locked_origin_usd = excluded.locked_origin_usd,
                  minted_solana_usd = excluded.minted_solana_usd,
                  burned_solana_usd = excluded.burned_solana_usd,
                  unlocked_origin_usd = excluded.unlocked_origin_usd,
                  updated_at = excluded.updated_at"#,
        )
        .bind(&state.bridge_id)
        .bind(&state.asset)
        .bind(state.locked_origin_usd)
        .bind(state.minted_solana_usd)
        .bind(state.burned_solana_usd)
        .bind(state.unlocked_origin_usd)
        .bind(state.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn event_count_buckets(&self, bridge_id: &str, since: DateTime<Utc>) -> Result<Vec<u32>> {
        let rows = sqlx::query(
            r#"SELECT COUNT(*) AS c
                 FROM bridge_events
                WHERE bridge_id = ? AND event_time >= ?
             GROUP BY CAST(strftime('%s', event_time) AS INTEGER) / 300
             ORDER BY CAST(strftime('%s', event_time) AS INTEGER) / 300 ASC"#,
        )
        .bind(bridge_id)
        .bind(since.to_rfc3339())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| r.get::<i64, _>("c") as u32)
            .collect())
    }

    async fn list_bridges(&self) -> Result<Vec<BridgeRow>> {
        let rows =
            sqlx::query("SELECT id, display_name, homepage, enabled FROM bridges ORDER BY id")
                .fetch_all(&self.pool)
                .await?;
        Ok(rows
            .into_iter()
            .map(|r| BridgeRow {
                id: r.get("id"),
                display_name: r.get("display_name"),
                homepage: r.get("homepage"),
                enabled: r.get::<i64, _>("enabled") != 0,
            })
            .collect())
    }
}

fn row_to_score(row: sqlx::sqlite::SqliteRow) -> Result<HealthScore> {
    let computed_at_str: String = row.try_get("computed_at")?;
    Ok(HealthScore {
        bridge_id: row.try_get("bridge_id")?,
        computed_at: parse_rfc3339(&computed_at_str)?,
        score: row.try_get::<i64, _>("score")? as u8,
        components: HealthComponents {
            parity_severity: row.try_get::<f64, _>("parity_severity")? as f32,
            outflow_severity: row.try_get::<f64, _>("outflow_severity")? as f32,
            signer_recency: row.try_get::<f64, _>("signer_recency")? as f32,
            frontend_recency: row.try_get::<f64, _>("frontend_recency")? as f32,
            oracle_staleness: row.try_get::<f64, _>("oracle_staleness")? as f32,
        },
    })
}

fn parse_rfc3339(s: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| StorageError::Database(sqlx::Error::Decode(Box::new(e))))
}

// Suppress an "unused" warning in case nothing in this crate calls into
// ChainId conversions; downstream crates use them.
#[allow(dead_code)]
fn _chain_smoke() {
    let _ = ChainId::Solana;
    let _ = BridgeEventKind::Lock;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::BridgeEventPayload;
    use chrono::Utc;
    use uuid::Uuid;

    #[tokio::test]
    async fn roundtrip_event() {
        let store = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let evt = BridgeEvent {
            id: Uuid::new_v4(),
            bridge_id: "wormhole".into(),
            event_time: Utc::now(),
            payload: BridgeEventPayload::Lock {
                chain: ChainId::Ethereum,
                asset: "USDC".into(),
                amount_usd: 1_000.0,
                tx: "0xdead".into(),
            },
        };
        store.insert_event(&evt).await.unwrap();
        let listed = store.list_events(&EventFilter::default()).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].bridge_id, "wormhole");
    }

    #[tokio::test]
    async fn seven_bridges_seeded() {
        let store = SqliteStorage::connect("sqlite::memory:").await.unwrap();
        let bridges = store.list_bridges().await.unwrap();
        assert_eq!(bridges.len(), 7);
    }
}
