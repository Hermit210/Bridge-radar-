-- Bridge Radar — seed the Relay adapter added during the bridge discovery/
-- verification pass (crates/radar-core/src/bridges/relay.rs).

INSERT INTO bridges (id, display_name, homepage) VALUES
    ('relay', 'Relay', 'https://relay.link')
ON CONFLICT (id) DO NOTHING;
