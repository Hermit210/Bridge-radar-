//! Postgres + Timescale implementation of [`Storage`] for production use.
//!
//! Schema lives in `migrations/0001_init.sql` (applied via docker-compose's
//! initdb mount, or manually via `psql -f`); this module is purely the
//! query layer. Logically equivalent to the SQLite impl — same column
//! names, same row shapes — so swapping `DATABASE_URL` from `sqlite://...`
//! to `postgres://...` requires no code changes.

use super::{BridgeRow, ParityState, Result, Storage, StorageError};
use crate::chain::ChainId;
use crate::event::{BridgeEvent, BridgeEventKind, EventFilter};
use crate::health::{HealthComponents, HealthScore};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Row};

#[derive(Clone)]
pub struct PostgresStorage {
    pool: PgPool,
}

impl PostgresStorage {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new().max_connections(8).connect(url).await?;
        Ok(Self { pool })
    }
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

#[async_trait]
impl Storage for PostgresStorage {
    async fn insert_event(&self, event: &BridgeEvent) -> Result<()> {
        let payload = serde_json::to_value(&event.payload)?;
        sqlx::query(
            r#"INSERT INTO bridge_events
               (id, event_time, bridge_id, event_type, chain_id, asset, amount_usd, tx, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT DO NOTHING"#,
        )
        .bind(event.id)
        .bind(event.event_time)
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
            String::from("SELECT id, event_time, bridge_id, payload FROM bridge_events WHERE TRUE");
        let mut idx = 1;
        if filter.bridge_id.is_some() {
            sql.push_str(&format!(" AND bridge_id = ${idx}"));
            idx += 1;
        }
        if filter.kind.is_some() {
            sql.push_str(&format!(" AND event_type = ${idx}"));
            idx += 1;
        }
        if filter.chain.is_some() {
            sql.push_str(&format!(" AND chain_id = ${idx}"));
            idx += 1;
        }
        if filter.since.is_some() {
            sql.push_str(&format!(" AND event_time >= ${idx}"));
            idx += 1;
        }
        sql.push_str(&format!(" ORDER BY event_time DESC LIMIT ${idx}"));

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
            q = q.bind(s);
        }
        q = q.bind(limit);

        let rows = q.fetch_all(&self.pool).await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let payload_value: serde_json::Value = row.try_get("payload")?;
            let payload = serde_json::from_value(payload_value)?;
            out.push(BridgeEvent {
                id: row.try_get("id")?,
                event_time: row.try_get("event_time")?,
                bridge_id: row.try_get("bridge_id")?,
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
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (computed_at, bridge_id) DO UPDATE SET
                  score = excluded.score,
                  parity_severity = excluded.parity_severity,
                  outflow_severity = excluded.outflow_severity,
                  signer_recency = excluded.signer_recency,
                  frontend_recency = excluded.frontend_recency,
                  oracle_staleness = excluded.oracle_staleness"#,
        )
        .bind(&score.bridge_id)
        .bind(score.computed_at)
        .bind(score.score as i16)
        .bind(score.components.parity_severity)
        .bind(score.components.outflow_severity)
        .bind(score.components.signer_recency)
        .bind(score.components.frontend_recency)
        .bind(score.components.oracle_staleness)
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
                 WHERE bridge_id = $1 AND computed_at >= $2
                 ORDER BY computed_at ASC"#,
        )
        .bind(bridge_id)
        .bind(since)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_score).collect()
    }

    async fn get_parity_state(&self, bridge_id: &str, asset: &str) -> Result<Option<ParityState>> {
        let row = sqlx::query(
            r#"SELECT bridge_id, asset,
                      locked_origin_usd::float8, minted_solana_usd::float8,
                      burned_solana_usd::float8, unlocked_origin_usd::float8, updated_at
                 FROM parity_state WHERE bridge_id = $1 AND asset = $2"#,
        )
        .bind(bridge_id)
        .bind(asset)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else { return Ok(None) };
        Ok(Some(ParityState {
            bridge_id: row.try_get("bridge_id")?,
            asset: row.try_get("asset")?,
            locked_origin_usd: row.try_get::<f64, _>("locked_origin_usd")?,
            minted_solana_usd: row.try_get::<f64, _>("minted_solana_usd")?,
            burned_solana_usd: row.try_get::<f64, _>("burned_solana_usd")?,
            unlocked_origin_usd: row.try_get::<f64, _>("unlocked_origin_usd")?,
            updated_at: row.try_get("updated_at")?,
        }))
    }

    async fn upsert_parity_state(&self, state: &ParityState) -> Result<()> {
        sqlx::query(
            r#"INSERT INTO parity_state
                 (bridge_id, asset, locked_origin_usd, minted_solana_usd,
                  burned_solana_usd, unlocked_origin_usd, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (bridge_id, asset) DO UPDATE SET
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
        .bind(state.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
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
                homepage: r.try_get::<Option<String>, _>("homepage").ok().flatten(),
                enabled: r.get::<bool, _>("enabled"),
            })
            .collect())
    }

    async fn event_count_buckets(&self, bridge_id: &str, since: DateTime<Utc>) -> Result<Vec<u32>> {
        let rows = sqlx::query(
            r#"SELECT COUNT(*) AS c
                 FROM bridge_events
                WHERE bridge_id = $1 AND event_time >= $2
             GROUP BY (EXTRACT(EPOCH FROM event_time)::bigint) / 300
             ORDER BY (EXTRACT(EPOCH FROM event_time)::bigint) / 300 ASC"#,
        )
        .bind(bridge_id)
        .bind(since)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| r.get::<i64, _>("c") as u32)
            .collect())
    }
}

fn row_to_score(row: PgRow) -> Result<HealthScore> {
    Ok(HealthScore {
        bridge_id: row.try_get("bridge_id")?,
        computed_at: row.try_get("computed_at")?,
        score: row.try_get::<i16, _>("score")? as u8,
        components: HealthComponents {
            parity_severity: row.try_get::<f32, _>("parity_severity")?,
            outflow_severity: row.try_get::<f32, _>("outflow_severity")?,
            signer_recency: row.try_get::<f32, _>("signer_recency")?,
            frontend_recency: row.try_get::<f32, _>("frontend_recency")?,
            oracle_staleness: row.try_get::<f32, _>("oracle_staleness")?,
        },
    })
}

// Suppress unused-import warnings for ChainId / BridgeEventKind — referenced
// indirectly via the trait surface and used by feature-flag-gated code paths
// in production deploys where ChainId routing is wired.
#[allow(dead_code)]
fn _types_used() {
    let _ = ChainId::Solana;
    let _ = BridgeEventKind::Lock;
    let _: Option<StorageError> = None;
}
