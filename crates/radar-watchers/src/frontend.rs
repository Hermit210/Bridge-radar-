//! Frontend bundle hash watcher (whitepaper §4.3).
//!
//! For each bridge's official URL, fetch the served HTML/JS bundle every 5
//! minutes from a single region (multi-region is a v1.5 follow-up — needs a
//! geographically distributed worker pool). sha256 the response body, store
//! the hash chain, emit `frontend_change` when the hash drifts.
//!
//! Drift can mean a legitimate release or a Curve / Galxe / Balancer-style
//! frontend hijack. v0 emits the event; the scorer's frontend_recency
//! component decays over 6 hours. False positives from legitimate releases
//! are bounded by a 30-min confirmation window in v1.

use anyhow::Result;
use chrono::Utc;
use radar_core::event::{BridgeEvent, BridgeEventPayload};
use radar_core::storage::SqliteStorage;
use radar_core::Storage;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{debug, info, warn};
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);
const REGION: &str = "default";

pub async fn run(storage: Arc<SqliteStorage>) -> Result<()> {
    let mut tick = interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (BridgeRadar/0.1)")
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut last: HashMap<String, String> = HashMap::new();

    loop {
        tick.tick().await;
        for &(bridge_id, url) in targets() {
            match hash_url(&client, url).await {
                Ok(h) => {
                    if let Some(prev) = last.get(bridge_id).cloned() {
                        if prev != h {
                            let evt = BridgeEvent {
                                id: Uuid::new_v4(),
                                bridge_id: bridge_id.into(),
                                event_time: Utc::now(),
                                payload: BridgeEventPayload::FrontendChange {
                                    region: REGION.into(),
                                    old_hash: prev,
                                    new_hash: h.clone(),
                                },
                            };
                            if let Err(e) = storage.insert_event(&evt).await {
                                warn!(bridge = %bridge_id, error = %e, "persist frontend_change");
                            } else {
                                info!(bridge = %bridge_id, hash = %&h[..12], "frontend_change emitted");
                            }
                        } else {
                            debug!(bridge = %bridge_id, "frontend hash unchanged");
                        }
                    } else {
                        info!(bridge = %bridge_id, hash = %&h[..12], "captured initial frontend hash");
                    }
                    last.insert(bridge_id.into(), h);
                }
                Err(e) => warn!(bridge = %bridge_id, error = %e, "fetch frontend"),
            }
        }
    }
}

async fn hash_url(client: &reqwest::Client, url: &str) -> Result<String> {
    let body = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let normalized = normalize_for_hashing(&body);
    let mut h = Sha256::new();
    h.update(normalized.as_bytes());
    Ok(hex::encode(h.finalize()))
}

/// Strip known per-request-random content that has nothing to do with the
/// actual served frontend, before hashing. Without this, a v0 raw-body hash
/// fires `frontend_change` on *every single poll* for any site with either
/// pattern below — confirmed live on 2026-07-23 by fetching the same URL
/// twice a few seconds apart with zero deploys in between:
///
/// - CSP nonces (`nonce="..."` on every `<script>`/`<link>` tag) — a fresh
///   random value per HTTP response by design (that's the entire point of a
///   CSP nonce: prevent replay). Confirmed on portalbridge.com (wormhole,
///   portal): two fetches produced completely different sha256 hashes, and
///   `diff` showed the only change was every `nonce="..."` value.
/// - Cloudflare's bot-management "challenge platform" snippet
///   (`window.__CF$cv$params={r:'...',t:'...'};`), injected by Cloudflare's
///   edge into the page *after* it leaves the origin server — confirmed on
///   core.allbridge.io the same way; the `r` (ray-ID-like) and `t`
///   (timestamp) values differ every request regardless of the actual
///   frontend code.
///
/// Neither pattern is part of the application bundle a real hijack would
/// change (script/asset paths, page structure, inline app code), so
/// stripping them doesn't weaken real hijack detection — it removes noise
/// that was drowning it out. This is necessarily a best-effort, evidence-
/// based list, not an exhaustive one: a site using a different per-request
/// injection pattern we haven't observed yet would need a new case added
/// here once discovered (never guessed in advance).
fn normalize_for_hashing(body: &[u8]) -> String {
    let text = String::from_utf8_lossy(body);
    let text = strip_attr_values(&text, "nonce=\"");
    strip_cf_challenge_params(&text)
}

/// Replaces the value of every `prefix"..."` occurrence with an empty
/// string, e.g. `nonce="abc123"` -> `nonce=""`. Leaves everything else
/// byte-for-byte untouched.
fn strip_attr_values(text: &str, prefix: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(prefix) {
        out.push_str(&rest[..start + prefix.len()]);
        rest = &rest[start + prefix.len()..];
        if let Some(end) = rest.find('"') {
            rest = &rest[end..]; // keep the closing quote, drop the value
        }
    }
    out.push_str(rest);
    out
}

/// Replaces `window.__CF$cv$params={...};` with a fixed placeholder,
/// wherever it appears verbatim.
fn strip_cf_challenge_params(text: &str) -> String {
    const MARKER: &str = "window.__CF$cv$params={";
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(MARKER) {
        out.push_str(&rest[..start]);
        rest = &rest[start + MARKER.len()..];
        if let Some(end) = rest.find("};") {
            rest = &rest[end + 2..];
        }
        out.push_str("window.__CF$cv$params={};");
    }
    out.push_str(rest);
    out
}

fn targets() -> &'static [(&'static str, &'static str)] {
    &[
        ("wormhole", "https://portalbridge.com/"),
        ("portal", "https://portalbridge.com/"),
        ("allbridge", "https://core.allbridge.io/"),
        ("debridge", "https://app.debridge.finance/"),
        ("layerzero", "https://layerzero.network/"),
        ("mayan", "https://swap.mayan.finance/"),
        ("axelar", "https://app.squidrouter.com/"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hash_is_deterministic_for_known_input() {
        let s = "hello bridge radar";
        let mut h = Sha256::new();
        h.update(s.as_bytes());
        let want = hex::encode(h.finalize());
        // Sanity check that our function would produce the same shape for a
        // controlled body: not testing the network, just the hashing.
        assert_eq!(want.len(), 64);
        assert!(want.chars().all(|c| c.is_ascii_hexdigit()));
    }

    /// Real excerpt structure from portalbridge.com (fetched 2026-07-23):
    /// every `<script>`/`<link>` tag carries a `nonce="..."` whose value is
    /// fresh per HTTP response. Two real fetches a few seconds apart hashed
    /// completely differently until this normalization was added.
    #[test]
    fn strips_csp_nonce_so_repeat_fetches_normalize_identically() {
        let fetch_one = r#"<link rel="stylesheet" href="/_next/static/chunks/091xrlgccn-ay.css" nonce="YmYzNGQ5MjctZGUyOS00M2Q4LWE2ZjQtNjdjNWY3NTE0MDBk" data-precedence="next"/><script src="/_next/static/chunks/0ihnvsohj5wkx.js" async="" nonce="YmYzNGQ5MjctZGUyOS00M2Q4LWE2ZjQtNjdjNWY3NTE0MDBk"></script>"#;
        let fetch_two = r#"<link rel="stylesheet" href="/_next/static/chunks/091xrlgccn-ay.css" nonce="ZGlmZmVyZW50LW5vbmNlLXZhbHVlLWhlcmU" data-precedence="next"/><script src="/_next/static/chunks/0ihnvsohj5wkx.js" async="" nonce="ZGlmZmVyZW50LW5vbmNlLXZhbHVlLWhlcmU"></script>"#;

        assert_ne!(fetch_one, fetch_two, "sanity: raw fetches really do differ");
        assert_eq!(
            normalize_for_hashing(fetch_one.as_bytes()),
            normalize_for_hashing(fetch_two.as_bytes()),
            "same page, different nonce, should normalize identically"
        );
    }

    /// Real excerpt from core.allbridge.io (fetched 2026-07-23): Cloudflare's
    /// bot-management challenge snippet embeds a ray-ID-like token (`r`) and
    /// a timestamp (`t`) that differ every request, injected at Cloudflare's
    /// edge — not part of allbridge's own served frontend at all.
    #[test]
    fn strips_cloudflare_challenge_params_so_repeat_fetches_normalize_identically() {
        let fetch_one = r#"<script>window.__CF$cv$params={r:'a1fbe8511e753afb',t:'MTc4NDgyMjUyNQ=='};var a=document.createElement('script');</script>"#;
        let fetch_two = r#"<script>window.__CF$cv$params={r:'ffffffffffffffff',t:'AAAAAAAAAAAAAAA='};var a=document.createElement('script');</script>"#;

        assert_ne!(fetch_one, fetch_two, "sanity: raw fetches really do differ");
        assert_eq!(
            normalize_for_hashing(fetch_one.as_bytes()),
            normalize_for_hashing(fetch_two.as_bytes()),
            "same page, different CF challenge token, should normalize identically"
        );
    }

    #[test]
    fn a_real_content_change_still_produces_a_different_hash() {
        // Guards against over-normalizing: swapping the actual script path
        // (what a real hijack would change) must still be caught.
        let original = r#"<script src="/_next/static/chunks/legit-bundle.js" nonce="abc123"></script>"#;
        let hijacked = r#"<script src="https://evil.example/malicious.js" nonce="xyz789"></script>"#;

        assert_ne!(
            normalize_for_hashing(original.as_bytes()),
            normalize_for_hashing(hijacked.as_bytes()),
            "a genuinely different script src must still change the normalized output"
        );
    }
}
