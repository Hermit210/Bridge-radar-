//! `radar-core` — shared types and traits for Bridge Radar.
//!
//! Every other crate in the workspace depends on this. Three things live here:
//!
//! 1. [`event`] — the canonical [`BridgeEvent`] enum (whitepaper §4.2). Once a
//!    raw chain event has been normalized into a `BridgeEvent`, no downstream
//!    consumer cares which chain or bridge it came from.
//! 2. [`storage`] — the [`Storage`] trait + a SQLite implementation. Other
//!    backends (Postgres + Timescale) plug in by implementing the trait.
//! 3. [`adapter`] — the [`BridgeAdapter`] trait. Each supported bridge
//!    implements this; the indexers iterate the registry.

pub mod adapter;
pub mod bridges;
pub mod chain;
pub mod event;
pub mod health;
pub mod pricing;
pub mod storage;

pub use adapter::BridgeAdapter;
pub use chain::ChainId;
pub use event::{BridgeEvent, BridgeEventKind, BridgeId, EventFilter};
pub use health::{HealthBand, HealthComponents, HealthScore};
pub use storage::{Storage, StorageError};
