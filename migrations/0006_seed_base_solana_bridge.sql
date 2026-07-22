-- Bridge Radar — seed the Coinbase/Base-Solana Bridge adapter added during
-- the bridge discovery/verification pass
-- (crates/radar-core/src/bridges/base_solana.rs).

INSERT INTO bridges (id, display_name, homepage) VALUES
    ('base-solana-bridge', 'Coinbase Bridge (Base-Solana)', 'https://docs.base.org/base-chain/quickstart/base-solana-bridge')
ON CONFLICT (id) DO NOTHING;
