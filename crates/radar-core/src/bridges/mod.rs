//! Per-bridge adapter modules. v0 ships a working Wormhole adapter plus
//! placeholder modules for the other bridges so contributors have a
//! clear "fill this in" surface.

pub mod across;
pub mod allbridge;
pub mod atomiq;
pub mod axelar;
pub mod base_solana;
pub mod cctp;
pub mod debridge;
pub mod garden;
pub mod hyperlane;
pub mod layerzero;
pub mod mayan;
pub mod orderly;
pub mod portal;
pub mod relay;
pub mod rhinofi;
pub mod wormhole;

use crate::adapter::BridgeAdapter;
use std::sync::Arc;

/// Returns every adapter shipped with this binary. Indexers iterate this to
/// decide which Solana programs / EVM contracts to watch.
///
/// `cctp` and `hyperlane` intentionally have modules (`cctp.rs`,
/// `hyperlane.rs`) but are NOT wired in here: both have an empty
/// `SOLANA_PROGRAMS` (no verified mainnet program ID), so including them
/// would make the EVM indexer watch their EVM contracts and emit
/// generic "any log -> Lock event" placeholders for a bridge with zero real
/// Solana-side detection — exactly the "looks monitored, isn't" gap this
/// project treats as a data-integrity bug. They stay registered in
/// `apps/api/src/bridges.ts` as real bridges with `detectionStatus:
/// "not_yet_supported"` / disabled scoring, and get wired back in here once
/// a verified Solana program ID lands for either one.
///
/// `stargate` had no module at all removed here: Stargate is not deployed on
/// Solana (see `BRIDGE_DISCOVERY.md` and the removed `stargate.rs` doc
/// comment), so it isn't a Solana bridge and doesn't belong in this registry.
pub fn registry() -> Vec<Arc<dyn BridgeAdapter>> {
    vec![
        Arc::new(wormhole::WormholeAdapter),
        Arc::new(allbridge::AllbridgeAdapter),
        Arc::new(debridge::DebridgeAdapter),
        Arc::new(layerzero::LayerZeroAdapter),
        Arc::new(mayan::MayanAdapter),
        Arc::new(portal::PortalAdapter),
        Arc::new(axelar::AxelarAdapter),
        Arc::new(relay::RelayAdapter),
        Arc::new(across::AcrossAdapter),
        Arc::new(garden::GardenAdapter),
        Arc::new(base_solana::BaseSolanaBridgeAdapter),
        Arc::new(atomiq::AtomiqAdapter),
        Arc::new(rhinofi::RhinoFiAdapter),
        Arc::new(orderly::OrderlyAdapter),
    ]
}
