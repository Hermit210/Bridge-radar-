-- Bridge Radar — seed the Across Protocol adapter added during the bridge
-- discovery/verification pass (crates/radar-core/src/bridges/across.rs).

INSERT INTO bridges (id, display_name, homepage) VALUES
    ('across', 'Across Protocol', 'https://across.to')
ON CONFLICT (id) DO NOTHING;
