# Deployment Guide

Real, step-by-step deployment for a single Ubuntu 24.04 LTS VPS. This is
documentation only — nothing in this file has been run against a live
server from this session (see **Verification status** at the bottom for
exactly what is and isn't proven).

## Architecture you're actually deploying

Every service — the 7 Rust binaries and the 2 Node apps — reads/writes the
**same SQLite file** (`data/radar.db`, WAL mode). This is the real,
currently-working topology, not a simplification:

- `apps/api` (the Node/Hono API the dashboard talks to) reads SQLite
  directly via `better-sqlite3`. It has **no Postgres client** — pointing
  its `DATABASE_URL` at Postgres today would not work.
- The Rust `Storage` trait *does* have a working Postgres+Timescale
  implementation (`crates/radar-core/src/storage/postgres.rs`), so the Rust
  services (indexer, watchers, scorer, attester, alerter, defillama sync)
  could in principle write to Postgres today.
- **Do not split these** — if the Rust services wrote to Postgres while
  `apps/api` kept reading SQLite, the dashboard would show nothing real
  (two disconnected databases). Until `apps/api` gets a Postgres client
  (tracked in `TASK4_STATUS.md`), **every service must point at the same
  SQLite file.** The `docker-compose.yml` Postgres+Timescale+Redis stack is
  real, tested-in-isolation infrastructure, but it is not load-bearing for
  anything yet — treat it as future work, not part of this deployment.

```
                  ┌─────────────────────────────┐
                  │   data/radar.db (SQLite,     │
                  │   WAL mode, on local disk)   │
                  └───────────┬─────────────────┘
        ┌───────────┬─────────┼──────────┬────────────┬──────────┐
        ▼           ▼         ▼          ▼            ▼          ▼
  indexer-solana indexer-evm watchers  scorer     defillama   attester*
        │                                                        │
        └──────────────────────┬─────────────────────────────────┘
                                ▼ (reads)
                          apps/api (Hono)
                                │
                                ▼
                        apps/dashboard (Next.js)
```
\* `radar-attester` pushes to the on-chain oracle program on **Solana
devnet only** (`ATTESTER_RPC_URL`), independent of everything else's
mainnet data. It is optional for a monitoring-only deployment — see
**Attester / on-chain oracle** below before enabling it.

## Prerequisites

- Ubuntu 24.04 LTS VPS, a non-root sudo-capable user
- A domain name pointed at the VPS (for TLS; skip if you're fine with
  plain HTTP on an IP)
- Outbound network access to: Solana RPC (Helius or similar), EVM RPCs,
  Pyth Hermes, DeFiLlama, the bridges' own frontends (frontend-hash
  watcher fetches them directly)

Install system packages:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev git curl ca-certificates
```

Install Rust (as the deploy user, not root):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version   # confirm it's at least the version pinned in Cargo.toml (rust-version = "1.85")
```

Install Node 20+ and pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
corepack prepare pnpm@latest --activate
```

## 1. Create a dedicated service user and directory

Never run these as root.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin radar
sudo mkdir -p /opt/bridge-radar
sudo chown radar:radar /opt/bridge-radar
```

## 2. Clone and configure

```bash
sudo -u radar git clone https://github.com/Hermit210/Bridge-radar- /opt/bridge-radar
cd /opt/bridge-radar
sudo -u radar cp .env.example .env
sudo -u radar chmod 600 .env
```

Edit `.env` as the `radar` user (`sudo -u radar nano .env`) and fill in
real production values:

- `SOLANA_RPC_URL` / `SOLANA_WS_URL` — a real Helius (or equivalent paid)
  endpoint. The default public RPC rate-limits hard under any real load.
- `ETH_RPC_URL` / `ARBITRUM_RPC_URL` / etc. — the shipped public defaults
  work but consider a paid provider (Alchemy/QuickNode) for reliability.
- `API_CORS_ORIGIN` — your real dashboard domain, not `localhost`.
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` — your real API domain
  (`https://api.yourdomain.com`, `wss://api.yourdomain.com/v1/ws`), **not**
  `localhost` — this gets baked into the dashboard's client bundle at
  build time, so it must be set correctly *before* `next build` (step 3).
- `DEFILLAMA_API_KEY` — optional; leave unset and the 3 categories that
  need it honestly report unavailable instead of faking data.
- `TELEGRAM_BOT_TOKEN` / `DISCORD_WEBHOOK_URL` / `ALERT_WEBHOOK_URL` —
  optional; the alerter dry-runs without them.
- Leave `DATABASE_URL` as the default SQLite path — see **Architecture**
  above for why.
- Leave `ATTESTER_RPC_URL`, `ATTESTER_KEYPAIR_PATH`, `ORACLE_PROGRAM_ID`
  unset unless you're deliberately enabling the devnet attester — see
  below.

## 3. Build

```bash
cd /opt/bridge-radar
sudo -u radar bash -c 'source ~/.cargo/env && cargo build --release --workspace'
sudo -u radar pnpm install --frozen-lockfile
sudo -u radar pnpm --filter @radar/api build
sudo -u radar pnpm --filter @radar/dashboard build   # reads NEXT_PUBLIC_* from .env at build time
```

Confirm the binaries exist before wiring up systemd:

```bash
ls target/release/ | grep -E 'radar-(indexer|watchers|scorer|attester|alerter|defillama)'
```

## 4. Install the systemd units

Unit files are in `deploy/systemd/` in this repo, written for exactly this
layout (`/opt/bridge-radar`, `radar` user). Copy and adjust only if your
paths differ:

```bash
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Core services (always enable for a monitoring deployment):

```bash
for svc in radar-indexer-solana radar-indexer-evm radar-watchers radar-scorer radar-defillama radar-api radar-dashboard; do
  sudo systemctl enable --now "$svc"
done
```

`radar-alerter` is optional (only useful once you've filled in a
Telegram/Discord/webhook sink in `.env`):

```bash
sudo systemctl enable --now radar-alerter
```

`radar-attester` is **not started by the loop above on purpose** — see
the next section before enabling it.

## Attester / on-chain oracle — read before enabling

`radar-attester` signs and submits real transactions
(`init_bridge`/`update_health`/`rotate_attester`) to the
`programs/radar-oracle` Anchor program, currently deployed on **Solana
devnet only**
(`6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM`). It needs:

- A real Solana keypair at `ATTESTER_KEYPAIR_PATH` (`solana-keygen new`),
  funded with devnet SOL (`solana airdrop 2 <pubkey> --url devnet`).
- `ATTESTER_RPC_URL` pointed at devnet explicitly — **do not** let it fall
  back to `SOLANA_RPC_URL`, which should be mainnet for everything else.

**Do not deploy the Anchor program to mainnet, and do not point the
attester at mainnet, without an explicit separate decision** — this
involves real funds and signing authority.

**Security note on the keypair file**: as of 2026-08-01, the repo's
`attester.json` (a real devnet keypair) is checked into git history and
was pushed to the public GitHub remote — the `.gitignore` patterns
(`**/*-keypair.json`, `**/keypair*.json`) don't match the literal filename
`attester.json`, so it slipped through. Treat any key that was ever in
that file as compromised. Before enabling `radar-attester` anywhere:
generate a **fresh** keypair, never reuse a key that touched git history,
and set real file permissions (`chmod 600`) on whatever path
`ATTESTER_KEYPAIR_PATH` points to. This is a real open item — see
`TASK4_STATUS.md`.

## 5. Reverse proxy + TLS

Example using Caddy (automatic TLS, simplest option):

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:3001
}
```

Caddy proxies WebSocket upgrades transparently, so `/v1/ws` works with no
extra config. Reload with `sudo systemctl reload caddy`.

Firewall: only expose 80/443 (and 22 for SSH) to the internet. Bind
3000/3001 to localhost only, or firewall them off directly:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 6. Verify the deployment

```bash
# Each service is actually running
systemctl status radar-indexer-solana radar-watchers radar-scorer radar-api radar-dashboard

# API is answering with real data
curl -s https://api.yourdomain.com/v1/healthz
curl -s https://api.yourdomain.com/v1/bridges | head -c 500

# Watch real events land
journalctl -u radar-indexer-solana -f

# Dashboard loads
curl -sI https://yourdomain.com | head -1
```

If `/v1/bridges` returns bridges with `health: null` for everything, the
scorer hasn't ticked yet (60s cycle) or the indexer hasn't ingested any
events yet — check `journalctl -u radar-scorer -f` and
`journalctl -u radar-indexer-solana -f` for real errors before assuming
something's broken.

## Updates

```bash
cd /opt/bridge-radar
sudo -u radar git pull
sudo -u radar bash -c 'source ~/.cargo/env && cargo build --release --workspace'
sudo -u radar pnpm install --frozen-lockfile
sudo -u radar pnpm --filter @radar/api build
sudo -u radar pnpm --filter @radar/dashboard build
sudo systemctl restart radar-indexer-solana radar-indexer-evm radar-watchers radar-scorer radar-defillama radar-api radar-dashboard
```

## Backups

SQLite in WAL mode is safe to back up while running with the online
backup API, not a raw file copy (a raw copy can catch the DB mid-write):

```bash
sudo -u radar sqlite3 /opt/bridge-radar/data/radar.db ".backup '/opt/bridge-radar/data/backup-$(date +%F).db'"
```

Cron this daily and ship the backups off-box (the health-score history
and event log are the only things not trivially re-derivable — real
on-chain data can be re-indexed from scratch, but only as far back as
each chain's RPC retains logs).

## Verification status (honest)

- **Not run against a live server this session** — no Docker, no local
  Postgres, and no passwordless `sudo` were available in the dev sandbox
  that wrote this doc, so none of the above has been executed end-to-end.
  Every command here is real (matches the actual `package.json` scripts,
  actual binary names, actual env vars in `.env.example`) but the
  deployment as a whole is unverified.
- **`apps/api` → Postgres wiring does not exist** — this guide
  deliberately deploys on SQLite only, which is the actually-working path
  today. See `TASK4_STATUS.md`.
- **The attester keypair security issue above is real and unresolved** as
  of this writing.

If you run this for real, the most valuable thing you could do is tell a
future session what broke — this doc should get corrected against reality,
not left as an aspirational document the way `PROGRESS.md` was before
2026-08-01.
