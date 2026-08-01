# Task 4 status — production-hardening

Written 2026-08-01. This is the honest state of "Task 4" (Postgres
migration + production-hardening) from the grant-readiness plan, split
into what's actually done vs. what still needs real work.

## Done today

- **`DEPLOYMENT.md`** — full step-by-step deployment guide for a real
  Ubuntu 24.04 VPS: prerequisites, build, systemd install, reverse proxy +
  TLS, verification, updates, backups. Written from the actual
  `package.json` scripts, actual binary names, and actual `.env.example`
  contents — not invented.
- **`deploy/systemd/*.service`** — one unit per Rust binary (indexer-solana,
  indexer-evm, watchers, scorer, defillama, alerter, attester) plus
  `radar-api` and `radar-dashboard`, with real hardening
  (`NoNewPrivileges`, `ProtectSystem=strict`, scoped `ReadWritePaths`,
  dedicated non-root `radar` user).

Both are documentation/config — they don't require a running server to
write correctly, and neither claims to have been executed.

## NOT done — needs a session with real Docker/Postgres access

**`apps/api` has no Postgres client.** It reads SQLite directly via
`better-sqlite3` (`apps/api/src/db.ts`, the `RadaDb` class, ~15
synchronous methods). The Rust `Storage` trait already has a complete
Postgres+Timescale implementation
(`crates/radar-core/src/storage/postgres.rs`) that the Rust services could
use today, but nothing on the Node/API side can read it.

Wiring this up for real is not a small addition:

1. `better-sqlite3` is **synchronous**; any real Postgres client for
   Node (`pg`, `postgres.js`, etc.) is **async**. Every one of `RadaDb`'s
   ~15 methods, and every one of `apps/api/src/index.ts`'s route handlers
   that calls them, would need to become async-aware — not a drop-in
   swap.
2. Whatever gets built needs to be tested against a real running
   Postgres instance before it can be trusted — this project's standing
   rule is real proof, never "should work," and database-layer code is
   exactly where an unverified assumption bites hardest.
3. This dev sandbox has **no Docker** (`docker: command not found`) and
   **no local Postgres, no passwordless `sudo`** to install one — so none
   of this could be verified here even if written. Writing it anyway and
   marking it "done" would violate the same standard.

**Decision (2026-08-01): defer.** `DEPLOYMENT.md` deploys on SQLite only,
which is the actual working path today — see its "Architecture you're
actually deploying" section for why NOT to try mixing SQLite and Postgres
across services. Do this properly in a session with real Docker/Postgres
access: start the existing `docker-compose.yml` stack, confirm the Rust
services actually write to it correctly (that part is untested too — the
Postgres `Storage` impl has never been run against a live database, only
compiled), then build and test the `apps/api` Postgres client against it.

## Separate, unrelated issue found while writing this

While checking `.gitignore` coverage for the deployment guide's secrets
section, found that **`attester.json` (a real Solana keypair) is tracked
in git** and was pushed to the public GitHub remote — the existing
`.gitignore` patterns don't match that literal filename. Flagged to the
user directly; not fixed here (key rotation and any git-history rewrite
are the user's call, not something to do unilaterally). See
`DEPLOYMENT.md`'s "Attester / on-chain oracle" section for the same note
in deployment context.

## What "done" looks like for Task 4

- [x] Deployment docs (this session)
- [x] Systemd units (this session)
- [ ] `apps/api` Postgres client, async-converted `RadaDb`, tested against
      a real running Postgres/Timescale instance
- [ ] `docker-compose.yml` stack actually run end-to-end at least once
- [ ] Auto-reconnect + health-status endpoints beyond the bare
      `/v1/healthz`
- [ ] A system-status dashboard page
