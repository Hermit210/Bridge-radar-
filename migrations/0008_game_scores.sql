-- Bridge Radar — "Bridge Race" mini-game leaderboard.
-- v0 dev loop uses an equivalent SQLite schema baked into apps/api/src/db.ts.
--
-- One row per completed run. wallet_address is the connected wallet that
-- played (validated server-side as a real base58 Solana address before
-- insert); score/blocks_used/distance are the real numbers the client
-- reported for that run. This is client-reported data, not server-verified
-- replay data -- there is no anti-cheat in v0, only sane-bounds validation
-- (see apps/api/src/index.ts). Real data from a real client, honestly not
-- tamper-proof; documented as a known limitation, not hidden.

CREATE TABLE IF NOT EXISTS game_scores (
    id              BIGSERIAL   PRIMARY KEY,
    wallet_address  TEXT        NOT NULL,
    score           INTEGER     NOT NULL CHECK (score >= 0),
    blocks_used     INTEGER     NOT NULL CHECK (blocks_used >= 0),
    distance        INTEGER     NOT NULL CHECK (distance >= 0),
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_scores_score_idx ON game_scores (score DESC);
CREATE INDEX IF NOT EXISTS game_scores_wallet_idx ON game_scores (wallet_address);
