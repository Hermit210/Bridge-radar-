use crate::event::BridgeId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Per-bridge composite Health Score (whitepaper §4.4).
///
/// Score is an unsigned byte 0..=100 — clamped before storage so downstream
/// consumers never see overflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthScore {
    pub bridge_id: BridgeId,
    pub computed_at: DateTime<Utc>,
    pub score: u8,
    pub components: HealthComponents,
}

/// Severities are normalized to 0.0..=1.0. Each detector emits its own
/// severity; the scorer multiplies by the published weights and subtracts
/// from 100. Component values are persisted alongside the score so any score
/// is fully auditable.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HealthComponents {
    pub parity_severity: f32,
    pub outflow_severity: f32,
    pub signer_recency: f32,
    pub frontend_recency: f32,
    pub oracle_staleness: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthBand {
    Green,
    Yellow,
    Red,
}

impl HealthBand {
    pub fn from_score(score: u8) -> Self {
        match score {
            80..=100 => HealthBand::Green,
            50..=79 => HealthBand::Yellow,
            _ => HealthBand::Red,
        }
    }
}

impl HealthScore {
    pub fn band(&self) -> HealthBand {
        HealthBand::from_score(self.score)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn band_boundaries() {
        assert_eq!(HealthBand::from_score(100), HealthBand::Green);
        assert_eq!(HealthBand::from_score(80), HealthBand::Green);
        assert_eq!(HealthBand::from_score(79), HealthBand::Yellow);
        assert_eq!(HealthBand::from_score(50), HealthBand::Yellow);
        assert_eq!(HealthBand::from_score(49), HealthBand::Red);
        assert_eq!(HealthBand::from_score(0), HealthBand::Red);
    }
}
