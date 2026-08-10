-- Real "Finality Watch" observations — see crates/radar-core/src/finality.rs
-- doc comment. One row per real Solana slot our own indexer's RPC polling
-- observed transition from "confirmed" to "finalized" commitment.
--
-- baseline_ms_at_time / is_anomalous are frozen at insert time (the real
-- trailing-hour median that existed when this row was written), not
-- recomputed later — this is what lets a later query honestly answer "was
-- finality behaving anomalously when this bridge event happened" using the
-- baseline that actually existed then.

CREATE TABLE IF NOT EXISTS finality_observations (
    slot                BIGINT      PRIMARY KEY,
    confirmed_at        TIMESTAMPTZ NOT NULL,
    finalized_at        TIMESTAMPTZ NOT NULL,
    elapsed_ms          BIGINT      NOT NULL,
    baseline_ms_at_time BIGINT,
    is_anomalous        BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS finality_observations_finalized_idx
    ON finality_observations (finalized_at DESC);
