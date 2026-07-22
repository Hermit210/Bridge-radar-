-- Bridge Radar — seed the Garden Finance adapter added during the bridge
-- discovery/verification pass (crates/radar-core/src/bridges/garden.rs).

INSERT INTO bridges (id, display_name, homepage) VALUES
    ('garden', 'Garden Finance', 'https://garden.finance')
ON CONFLICT (id) DO NOTHING;
