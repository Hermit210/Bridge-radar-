-- Bridge Radar — "Bridge Health Streak" daily check-in habit loop.
-- v0 dev loop uses an equivalent SQLite schema baked into apps/api/src/db.ts.
--
-- One row per wallet. Real calendar-day tracking (UTC), updated by a single
-- upsert (see PostgresRadarDb.recordActivity in db.ts) each time a connected
-- wallet loads /my-activity: increments current_streak if last_active_date
-- was literally yesterday, resets to 1 on any gap, and is a same-day no-op
-- if already recorded today (repeat page loads the same day don't inflate
-- the count).

CREATE TABLE IF NOT EXISTS user_streaks (
    wallet_address    TEXT        PRIMARY KEY,
    last_active_date  DATE        NOT NULL,
    current_streak    INTEGER     NOT NULL DEFAULT 1 CHECK (current_streak >= 1),
    longest_streak    INTEGER     NOT NULL DEFAULT 1 CHECK (longest_streak >= 1),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
