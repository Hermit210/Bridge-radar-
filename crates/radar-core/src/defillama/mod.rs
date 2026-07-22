//! DeFiLlama Solana data layer — external reference/cross-verification
//! context, never a substitute for our own on-chain indexing. See
//! [`client::DefiLlamaClient`] for the nine data categories and
//! [`crate::storage::Storage::defillama_upsert`] for how results are cached.

pub mod client;
pub mod types;

pub use client::{DefiLlamaClient, DefiLlamaError, TRACKED_BRIDGE_SLUGS};
pub use types::SOURCE;
