//! Per-bridge adapter modules. v0 ships a working Wormhole adapter plus
//! placeholder modules for the other six bridges so contributors have a
//! clear "fill this in" surface.

pub mod allbridge;
pub mod axelar;
pub mod debridge;
pub mod layerzero;
pub mod mayan;
pub mod portal;
pub mod wormhole;

use crate::adapter::BridgeAdapter;
use std::sync::Arc;

/// Returns every adapter shipped with this binary. Indexers iterate this.
pub fn registry() -> Vec<Arc<dyn BridgeAdapter>> {
    vec![
        Arc::new(wormhole::WormholeAdapter),
        Arc::new(allbridge::AllbridgeAdapter),
        Arc::new(debridge::DebridgeAdapter),
        Arc::new(layerzero::LayerZeroAdapter),
        Arc::new(mayan::MayanAdapter),
        Arc::new(portal::PortalAdapter),
        Arc::new(axelar::AxelarAdapter),
    ]
}
