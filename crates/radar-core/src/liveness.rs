//! Minimal HTTP liveness probe for long-running binaries that need to look
//! like a "web service" to a host that only knows how to keep HTTP servers
//! alive (e.g. Render's free tier, which spins down anything that isn't
//! listening on `$PORT`). This is deliberately not a real HTTP server: every
//! request gets the same `200 OK`, regardless of method or path, so six
//! otherwise-non-HTTP binaries don't each need an HTTP framework dependency
//! just to answer a health check.

use std::io;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{info, warn};

const RESPONSE: &[u8] =
    b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK";

/// Binds `0.0.0.0:<port>` and answers every connection with a 200 OK,
/// forever. Meant to be `tokio::spawn`ed alongside a binary's real work loop
/// via [`spawn_if_configured`] — not awaited directly in `main`.
pub async fn serve(port: u16) -> io::Result<()> {
    let listener = TcpListener::bind(("0.0.0.0", port)).await?;
    info!(port, "liveness probe listening");
    loop {
        let (mut socket, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(e) => {
                warn!(error = %e, "liveness probe: accept failed");
                continue;
            }
        };
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            // Drain (part of) the request first so the client sees a real
            // response instead of a connection reset mid-request.
            let _ = socket.read(&mut buf).await;
            let _ = socket.write_all(RESPONSE).await;
            let _ = socket.shutdown().await;
        });
    }
}

/// Spawns [`serve`] as a background task when `PORT` is set in the
/// environment (i.e. running under Render or similar), a no-op otherwise
/// (local dev, systemd) — so this has zero effect outside of a host that
/// actually requires an HTTP health check.
pub fn spawn_if_configured() {
    let Some(port) = std::env::var("PORT").ok().and_then(|p| p.parse::<u16>().ok()) else {
        return;
    };
    tokio::spawn(async move {
        if let Err(e) = serve(port).await {
            warn!(error = %e, port, "liveness probe exited");
        }
    });
}
