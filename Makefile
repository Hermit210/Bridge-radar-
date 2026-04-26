.PHONY: help install build test lint fmt up down reset dev-indexer dev-scorer dev-api dev-dash anchor

help:
	@echo "Bridge Radar — common tasks"
	@echo "  make install       Install Rust + JS deps"
	@echo "  make build         Build all crates and apps"
	@echo "  make test          Run cargo + pnpm tests"
	@echo "  make lint          clippy + tsc + eslint"
	@echo "  make fmt           rustfmt + prettier"
	@echo "  make up            Start Timescale + Redis (docker compose)"
	@echo "  make down          Stop Timescale + Redis"
	@echo "  make reset         Wipe DB volumes (destructive)"
	@echo "  make dev-indexer   Run Solana indexer against mainnet"
	@echo "  make dev-evm       Run EVM indexer (eth + arb + base + op + bnb + polygon)"
	@echo "  make dev-scorer    Run scorer (writes Health Scores every 60s)"
	@echo "  make dev-attester  Run attester (pushes scores to on-chain oracle)"
	@echo "  make dev-watchers  Run periodic detectors (signer + frontend + oracle)"
	@echo "  make dev-alerter   Run alerter (Telegram + Discord + webhook fan-out)"
	@echo "  make dev-api       Run API gateway on :3001"
	@echo "  make dev-dash      Run Next.js dashboard on :3000"
	@echo "  make anchor        anchor build the on-chain oracle program"

install:
	cargo fetch
	pnpm install

build:
	cargo build --workspace
	pnpm -r build

test:
	cargo test --workspace
	pnpm -r test

lint:
	cargo clippy --workspace --all-targets -- -D warnings
	pnpm -r typecheck
	pnpm -r lint

fmt:
	cargo fmt --all
	pnpm -r format

up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v
	rm -rf data/

dev-indexer:
	cargo run -p radar-indexer-solana

dev-evm:
	cargo run -p radar-indexer-evm

dev-scorer:
	cargo run -p radar-scorer

dev-attester:
	cargo run -p radar-attester

dev-watchers:
	cargo run -p radar-watchers

dev-alerter:
	cargo run -p radar-alerter

dev-api:
	pnpm --filter @radar/api dev

dev-dash:
	pnpm --filter @radar/dashboard dev

anchor:
	cd programs/radar-oracle && anchor build
