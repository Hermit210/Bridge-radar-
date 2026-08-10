# @bridge-radar/sdk

Minimal client for [Bridge Radar](https://github.com/Hermit210/Bridge-radar-)'s
real-time Solana bridge health scores — via the public REST API or directly
on-chain. Published on npm: [npmjs.com/package/@bridge-radar/sdk](https://www.npmjs.com/package/@bridge-radar/sdk).

## What this is not

There is no hosted production Bridge Radar API yet — nothing in this project
is deployed publicly (see `DEPLOYMENT.md` at the repo root). `getBridgeHealth`
therefore takes the API URL explicitly rather than a fake baked-in default.
The on-chain oracle program is deployed on **Solana devnet only**.

## Install

```bash
npm install @bridge-radar/sdk
```

There is no hosted production Bridge Radar API yet (see "What this is not"
below), so `getBridgeHealth` takes the API URL as an explicit argument —
point it at your own running `apps/api` instance, or at our production URL
once one is deployed.

## API

```ts
import { getBridgeHealth, getBridgeHealthOnChain, bandOf } from "@bridge-radar/sdk";
import { Connection } from "@solana/web3.js";

// Real off-chain score, from wherever you run apps/api.
const { bridge, health } = await getBridgeHealth("wormhole", "http://localhost:3001");
console.log(health?.score, health ? bandOf(health.score) : "no score yet");

// Real on-chain score, read directly from the devnet oracle PDA — no API
// involved. Throws if the bridge was never registered on-chain (never a
// fabricated 0 for "doesn't exist").
const conn = new Connection("https://api.devnet.solana.com");
const onChainScore = await getBridgeHealthOnChain(conn, "wormhole");
```

Note: the on-chain score can legitimately differ from the API's off-chain
score — the on-chain value only updates when `radar-attester` actually runs
and pushes a new score (see `DEPLOYMENT.md`'s "Attester / on-chain oracle"
section). If the attester isn't running continuously, the on-chain oracle is
stale relative to the live API. This is real, observed behavior, not a bug —
which of the two you should read depends on whether your dApp needs "what
Bridge Radar's backend currently computes" or "what's actually attested
on-chain right now."

## Example: gating a withdrawal on real bridge health

```ts
import { getBridgeHealthOnChain } from "@bridge-radar/sdk";
import { Connection } from "@solana/web3.js";

const MIN_SAFE_SCORE = 70;

async function withdrawIfHealthy(connection: Connection, bridgeId: string, doWithdraw: () => Promise<void>) {
  let score: number;
  try {
    score = await getBridgeHealthOnChain(connection, bridgeId);
  } catch (e) {
    // Bridge was never registered on-chain, or the RPC call failed — an
    // honest "we don't know" is not the same as "it's healthy." Don't
    // silently proceed.
    throw new Error(`Could not read ${bridgeId}'s on-chain health score: ${(e as Error).message}`);
  }

  if (score < MIN_SAFE_SCORE) {
    throw new Error(`${bridgeId}'s health score is ${score} (below ${MIN_SAFE_SCORE}) — refusing to proceed`);
  }

  await doWithdraw();
}
```

This is real, runnable code — `getBridgeHealthOnChain` genuinely reads the
`BridgeHealth` account (`programs/radar-oracle/src/lib.rs`) at
`findProgramAddressSync(["health", sha256(bridgeId)], RADAR_ORACLE_PROGRAM_ID)`
and returns its real `score` field, or throws if the account doesn't exist.
Bridge Radar's own Health Score is a real-time and historical signal, not a
guarantee or financial advice — see `WHITEPAPER.md` §5.3.

## Types

`BridgeHealth`, `HealthScore`, `HealthBand`, `BridgeRow`, `DefiLlamaProtocolTvl`,
and `bandOf` are defined directly in this package (mirrored from
`packages/shared/src/index.ts`, which is workspace-private and never
published) so the published package has no unresolvable dependency.
