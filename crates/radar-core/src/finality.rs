//! Real Solana finality-time observations — how long, in practice, a slot
//! this indexer's own RPC connection reported as `confirmed` took to also
//! be reported `finalized`. Relevant during the TowerBFT -> Alpenglow
//! consensus transition: this is measured relative to our own rolling
//! baseline, never a hardcoded assumption about which consensus version is
//! currently active, so it stays meaningful whether the network is on the
//! old (~12.8s) or new (~100-150ms) finality regime.
//!
//! These are polling-observed timestamps — real wall-clock time when this
//! process's own `getSlot` poll first saw a given slot reach each
//! commitment level (see `radar-indexer-solana/src/finality.rs`) — bounded
//! by our own poll interval, not a canonical on-chain-recorded duration.
//! Solana does not record a single "finalized at" timestamp on-chain;
//! finality is an observed, stake-weighted consensus event. Documented
//! honestly wherever this data is surfaced (API, dashboard).

use chrono::{DateTime, Utc};

/// Minimum real observations required in a trailing window before its
/// median is trusted as a baseline — below this, `baseline_ms` is `None`
/// and nothing is ever flagged anomalous, rather than computing a noisy
/// median off a handful of samples.
pub const MIN_BASELINE_SAMPLES: usize = 5;

/// An observation counts as anomalous when it takes at least this many
/// times the trailing-window median. Chosen, not derived: 3x is a real
/// order-of-magnitude deviation (not ordinary jitter) while still being
/// sensitive enough to catch a genuine behavior change — e.g. mid-Alpenglow
/// rollout — without hardcoding a consensus-specific millisecond threshold.
pub const ANOMALY_MULTIPLIER: f64 = 3.0;

/// One real observed slot.
#[derive(Debug, Clone, PartialEq)]
pub struct FinalityObservation {
    pub slot: u64,
    pub confirmed_at: DateTime<Utc>,
    pub finalized_at: DateTime<Utc>,
    pub elapsed_ms: i64,
    /// The real trailing-window median at the moment this observation was
    /// recorded, if there were enough real samples (`MIN_BASELINE_SAMPLES`)
    /// to trust one — `None` otherwise. Frozen at observation time so later
    /// cross-referencing against a bridge event answers "was finality
    /// behaving anomalously back then" using the baseline that actually
    /// existed then, not one recomputed after the fact.
    pub baseline_ms_at_time: Option<i64>,
    /// True only when `baseline_ms_at_time` exists AND `elapsed_ms` exceeded
    /// it by `ANOMALY_MULTIPLIER`. Always false with no real baseline yet.
    pub is_anomalous: bool,
}

impl FinalityObservation {
    /// Builds a real observation from real confirmed/finalized timestamps,
    /// scoring it against `trailing_window` (the real observations already
    /// on record for, typically, the preceding hour — caller supplies it;
    /// this function doesn't query storage itself).
    pub fn observe(
        slot: u64,
        confirmed_at: DateTime<Utc>,
        finalized_at: DateTime<Utc>,
        trailing_window: &[FinalityObservation],
    ) -> Self {
        let elapsed_ms = (finalized_at - confirmed_at).num_milliseconds().max(0);
        let baseline_ms_at_time = if trailing_window.len() >= MIN_BASELINE_SAMPLES {
            median_elapsed_ms(trailing_window)
        } else {
            None
        };
        let is_anomalous = baseline_ms_at_time
            .map(|b| b > 0 && elapsed_ms as f64 > b as f64 * ANOMALY_MULTIPLIER)
            .unwrap_or(false);
        Self {
            slot,
            confirmed_at,
            finalized_at,
            elapsed_ms,
            baseline_ms_at_time,
            is_anomalous,
        }
    }
}

/// Real, current finality health — computed fresh from real stored
/// observations on every call, never cached/estimated.
#[derive(Debug, Clone, PartialEq)]
pub struct FinalityHealth {
    pub latest_slot: u64,
    pub latest_elapsed_ms: i64,
    /// `None` if there weren't enough real observations to trust a median —
    /// never a fabricated baseline.
    pub baseline_ms: Option<i64>,
    pub sample_count: usize,
    pub is_anomalous: bool,
}

/// Real median of `elapsed_ms` across `observations`.
pub fn median_elapsed_ms(observations: &[FinalityObservation]) -> Option<i64> {
    if observations.is_empty() {
        return None;
    }
    let mut values: Vec<i64> = observations.iter().map(|o| o.elapsed_ms).collect();
    values.sort_unstable();
    let mid = values.len() / 2;
    Some(if values.len() % 2 == 0 {
        (values[mid - 1] + values[mid]) / 2
    } else {
        values[mid]
    })
}

/// Computes real current finality health from `latest` (the most recent
/// real observation) scored against `window` (a real trailing-window
/// sample, typically the trailing hour — caller's choice what to pass).
pub fn compute_health(latest: &FinalityObservation, window: &[FinalityObservation]) -> FinalityHealth {
    let sample_count = window.len();
    let baseline_ms = if sample_count >= MIN_BASELINE_SAMPLES {
        median_elapsed_ms(window)
    } else {
        None
    };
    let is_anomalous = baseline_ms
        .map(|b| b > 0 && latest.elapsed_ms as f64 > b as f64 * ANOMALY_MULTIPLIER)
        .unwrap_or(false);
    FinalityHealth {
        latest_slot: latest.slot,
        latest_elapsed_ms: latest.elapsed_ms,
        baseline_ms,
        sample_count,
        is_anomalous,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn obs_with_window(slot: u64, elapsed_ms: i64, window: &[FinalityObservation]) -> FinalityObservation {
        let confirmed_at = Utc::now();
        let finalized_at = confirmed_at + Duration::milliseconds(elapsed_ms);
        FinalityObservation::observe(slot, confirmed_at, finalized_at, window)
    }

    fn obs(slot: u64, elapsed_ms: i64) -> FinalityObservation {
        obs_with_window(slot, elapsed_ms, &[])
    }

    #[test]
    fn elapsed_ms_computed_from_real_timestamps() {
        let o = obs(100, 12_800);
        assert_eq!(o.elapsed_ms, 12_800);
    }

    #[test]
    fn median_of_odd_count() {
        let observations = vec![obs(1, 100), obs(2, 300), obs(3, 200)];
        assert_eq!(median_elapsed_ms(&observations), Some(200));
    }

    #[test]
    fn median_of_even_count() {
        let observations = vec![obs(1, 100), obs(2, 200), obs(3, 300), obs(4, 400)];
        assert_eq!(median_elapsed_ms(&observations), Some(250));
    }

    #[test]
    fn no_baseline_below_min_samples() {
        // Only 2 real prior observations -- below MIN_BASELINE_SAMPLES (5).
        let window = vec![obs(1, 100), obs(2, 100)];
        let latest = obs_with_window(3, 100_000, &window);
        assert_eq!(latest.baseline_ms_at_time, None);
        assert!(
            !latest.is_anomalous,
            "must never flag anomalous without a real baseline"
        );
    }

    #[test]
    fn anomaly_flagged_when_over_multiplier() {
        let window: Vec<_> = (0..10).map(|i| obs(i, 12_000 + i as i64 * 10)).collect(); // median 12045
        let latest = obs_with_window(999, 40_000, &window); // > 3x median
        assert_eq!(latest.baseline_ms_at_time, Some(12_045));
        assert!(latest.is_anomalous);
    }

    #[test]
    fn not_anomalous_within_multiplier() {
        let window: Vec<_> = (0..10).map(|i| obs(i, 12_000)).collect();
        let latest = obs_with_window(999, 20_000, &window); // < 3x of 12000
        assert!(!latest.is_anomalous);
    }

    #[test]
    fn compute_health_mirrors_observe_logic() {
        let window: Vec<_> = (0..6).map(|i| obs(i, 150)).collect(); // fast/Alpenglow-like baseline
        let latest = obs(999, 200); // within normal jitter
        let health = compute_health(&latest, &window);
        assert_eq!(health.baseline_ms, Some(150));
        assert!(!health.is_anomalous);
        assert_eq!(health.sample_count, 6);
    }

    #[test]
    fn compute_health_flags_anomaly_on_fast_baseline_too() {
        // Baseline reflects a fast (Alpenglow-like) network -- an
        // old-TowerBFT-speed 12.8s observation against it must still flag,
        // since this is relative to the observed baseline, not a hardcoded
        // "12.8s is normal" assumption.
        let window: Vec<_> = (0..6).map(|i| obs(i, 120)).collect();
        let latest = obs(999, 12_800);
        let health = compute_health(&latest, &window);
        assert!(health.is_anomalous);
    }
}
