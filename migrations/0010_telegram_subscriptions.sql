-- Bridge Radar — Telegram weekly-digest subscriptions.
-- v0 dev loop uses an equivalent SQLite schema baked into apps/api/src/db.ts
-- and crates/radar-core/src/storage/sqlite.rs.
--
-- One row per wallet (real PK on wallet_address -- a wallet re-linking from
-- a different Telegram chat updates chat_id rather than creating a second
-- row). Written by the real Telegram bot's /start <wallet_address> deep-link
-- handler (crates/radar-alerter/src/commands.rs), read by the Node API's
-- weekly-digest scheduler (apps/api/src/telegram-digest.ts) and the
-- subscription-status endpoint.

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    wallet_address  TEXT        PRIMARY KEY,
    chat_id         BIGINT      NOT NULL,
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS telegram_subscriptions_chat_id_idx ON telegram_subscriptions (chat_id);
