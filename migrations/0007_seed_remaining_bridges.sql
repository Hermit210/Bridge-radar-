-- Bridge Radar — seed the remaining adapters/registry rows that were added
-- to crates/radar-core/src/storage/sqlite.rs's INIT_SQL (the authoritative
-- schema for the v0 dev loop) after migrations 0001-0006 were written, but
-- never mirrored into the Postgres migration set. Discovered 2026-08-09
-- while wiring apps/api to a real Postgres instance for the first time --
-- this is the first point that gap could be caught, since the Postgres
-- migrations had never been run end-to-end before.

-- Atomiq Exchange, rhino.fi, Orderly Network: real, mainnet-verified
-- adapters added during bridge-discovery passes 2/3
-- (crates/radar-core/src/bridges/{atomiq,rhinofi,orderly}.rs).
INSERT INTO bridges (id, display_name, homepage) VALUES
    ('atomiq',  'Atomiq Exchange', 'https://atomiq.exchange'),
    ('rhinofi', 'rhino.fi',        'https://rhino.fi'),
    ('orderly', 'Orderly Network', 'https://orderly.network')
ON CONFLICT (id) DO NOTHING;

-- Circle CCTP, Hyperlane: real bridges but no verified Solana program ID
-- yet -- seeded disabled so the scorer (`if !bridge.enabled { continue }`)
-- skips them entirely instead of writing a green 100 for "never
-- monitored". Same treatment as sqlite.rs's INIT_SQL.
INSERT INTO bridges (id, display_name, homepage, enabled) VALUES
    ('cctp',      'Circle CCTP', 'https://www.circle.com/en/usdc/bridge', FALSE),
    ('hyperlane', 'Hyperlane',   'https://hyperlane.xyz', FALSE)
ON CONFLICT (id) DO NOTHING;
