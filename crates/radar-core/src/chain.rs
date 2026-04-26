use serde::{Deserialize, Serialize};
use std::fmt;

/// Canonical chain identifier — used in events and adapter configs.
///
/// Strings rather than numeric IDs because `BridgeEvent` is exposed via the
/// public REST/WS API and human-readable values are friendlier for consumers.
/// The `Other(String)` arm lets us add chains without a code change.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChainId {
    Solana,
    Ethereum,
    Arbitrum,
    Base,
    Optimism,
    Bnb,
    Polygon,
    Sui,
    Aptos,
    Cosmos,
    #[serde(untagged)]
    Other(String),
}

impl ChainId {
    pub fn as_str(&self) -> &str {
        match self {
            ChainId::Solana => "solana",
            ChainId::Ethereum => "ethereum",
            ChainId::Arbitrum => "arbitrum",
            ChainId::Base => "base",
            ChainId::Optimism => "optimism",
            ChainId::Bnb => "bnb",
            ChainId::Polygon => "polygon",
            ChainId::Sui => "sui",
            ChainId::Aptos => "aptos",
            ChainId::Cosmos => "cosmos",
            ChainId::Other(s) => s.as_str(),
        }
    }
}

impl fmt::Display for ChainId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl From<&str> for ChainId {
    fn from(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "solana" => ChainId::Solana,
            "ethereum" | "eth" | "mainnet" => ChainId::Ethereum,
            "arbitrum" | "arb" => ChainId::Arbitrum,
            "base" => ChainId::Base,
            "optimism" | "op" => ChainId::Optimism,
            "bnb" | "bsc" => ChainId::Bnb,
            "polygon" | "matic" => ChainId::Polygon,
            "sui" => ChainId::Sui,
            "aptos" => ChainId::Aptos,
            "cosmos" | "cosmoshub" => ChainId::Cosmos,
            other => ChainId::Other(other.to_string()),
        }
    }
}
