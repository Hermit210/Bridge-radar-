-- Bridge Radar — initial schema (Postgres + Timescale).
-- v0 dev loop uses an equivalent SQLite schema baked into radar-core's SQLite Storage impl.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── Bridges registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bridges (
    id              TEXT        PRIMARY KEY,           -- canonical slug, e.g. "wormhole"
    display_name    TEXT        NOT NULL,
    homepage        TEXT,
    config          JSONB       NOT NULL DEFAULT '{}', -- programs, contracts, signer set, etc.
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Normalized event stream (the schema we expose publicly) ─────────────────
-- Mirrors radar-core::BridgeEvent. type discriminates payload columns.
CREATE TABLE IF NOT EXISTS bridge_events (
    -- composite PK: (event_time, id) — required by Timescale on hypertables
    id              UUID        NOT NULL,
    event_time      TIMESTAMPTZ NOT NULL,
    bridge_id       TEXT        NOT NULL REFERENCES bridges(id),
    event_type      TEXT        NOT NULL CHECK (event_type IN
                                ('lock','mint','burn','unlock','signer_change','frontend_change','oracle_stale')),
    chain_id        TEXT,
    asset           TEXT,
    amount_usd      NUMERIC(38, 8),
    tx              TEXT,
    payload         JSONB       NOT NULL DEFAULT '{}',
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('bridge_events', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS bridge_events_bridge_time_idx
    ON bridge_events (bridge_id, event_time DESC);
CREATE INDEX IF NOT EXISTS bridge_events_type_time_idx
    ON bridge_events (event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS bridge_events_asset_time_idx
    ON bridge_events (asset, event_time DESC) WHERE asset IS NOT NULL;

-- ─── Health scores (one row per (bridge, computed_at)) ───────────────────────
CREATE TABLE IF NOT EXISTS bridge_health_scores (
    bridge_id           TEXT        NOT NULL REFERENCES bridges(id),
    computed_at         TIMESTAMPTZ NOT NULL,
    score               SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
    parity_severity     REAL        NOT NULL DEFAULT 0,
    outflow_severity    REAL        NOT NULL DEFAULT 0,
    signer_recency      REAL        NOT NULL DEFAULT 0,
    frontend_recency    REAL        NOT NULL DEFAULT 0,
    oracle_staleness    REAL        NOT NULL DEFAULT 0,
    components          JSONB       NOT NULL DEFAULT '{}',
    PRIMARY KEY (computed_at, bridge_id)
);

SELECT create_hypertable('bridge_health_scores', 'computed_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS bridge_health_scores_bridge_time_idx
    ON bridge_health_scores (bridge_id, computed_at DESC);

-- ─── Signer-set snapshots (for diff-based signer_change detection) ───────────
CREATE TABLE IF NOT EXISTS signer_sets (
    bridge_id   TEXT        NOT NULL REFERENCES bridges(id),
    captured_at TIMESTAMPTZ NOT NULL,
    members     TEXT[]      NOT NULL,
    source_tx   TEXT,
    PRIMARY KEY (bridge_id, captured_at)
);

-- ─── Frontend bundle hash chain ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frontend_hashes (
    bridge_id   TEXT        NOT NULL REFERENCES bridges(id),
    region      TEXT        NOT NULL,
    hash        TEXT        NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (bridge_id, region, captured_at)
);

-- ─── Lock-vs-mint running totals (parity detector working set) ───────────────
CREATE TABLE IF NOT EXISTS parity_state (
    bridge_id           TEXT        NOT NULL REFERENCES bridges(id),
    asset               TEXT        NOT NULL,
    locked_origin_usd   NUMERIC(38, 8) NOT NULL DEFAULT 0,
    minted_solana_usd   NUMERIC(38, 8) NOT NULL DEFAULT 0,
    burned_solana_usd   NUMERIC(38, 8) NOT NULL DEFAULT 0,
    unlocked_origin_usd NUMERIC(38, 8) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bridge_id, asset)
);

-- ─── Seed the bridges we ship adapters for at v0 ─────────────────────────────
INSERT INTO bridges (id, display_name, homepage) VALUES
    ('wormhole',  'Wormhole',  'https://wormhole.com'),
    ('allbridge', 'Allbridge', 'https://allbridge.io'),
    ('debridge',  'deBridge',  'https://debridge.finance'),
    ('layerzero', 'LayerZero', 'https://layerzero.network'),
    ('mayan',     'Mayan',     'https://mayan.finance'),
    ('portal',    'Portal',    'https://portalbridge.com'),
    ('axelar',    'Axelar',    'https://axelar.network')
ON CONFLICT (id) DO NOTHING;
