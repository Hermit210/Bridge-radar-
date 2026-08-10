# @bridge-radar/fetch

A Solana `Connection` with basic sequential RPC failover, plus one extra
real method — `checkBridgeHealth()` — that gates on
[Bridge Radar](https://github.com/Hermit210/Bridge-radar-)'s real bridge
health score via [`@bridge-radar/sdk`](https://www.npmjs.com/package/@bridge-radar/sdk).

## What this is not

This is **not** a load balancer. It tries each RPC URL you give it, in
order, at connection creation time, and keeps the first one that actually
responds (`getVersion()`, not just a TCP check). It does **not** retry or
switch endpoints per call, does not track endpoint health over time, and
does not do weighted/round-robin routing. If you need any of that, use
[SolRPC](https://github.com/0xRadioAc7iv/solrpc) — this package only adds
the one thing SolRPC doesn't: real bridge-health gating.

There is also no hosted production Bridge Radar API yet (see
`DEPLOYMENT.md` at the repo root), so `checkBridgeHealth()` requires you to
pass a real `apiUrl` — your own running `apps/api`, or our production URL
once one is deployed.

## Install

```bash
npm install @bridge-radar/fetch
```

## Usage

```ts
import { createFailoverConnection } from "@bridge-radar/fetch";

// Tries each URL in order, keeps the first that responds to a real
// getVersion() call. Throws if all of them fail.
const connection = await createFailoverConnection(
  ["https://my-primary-rpc.example.com", "https://api.mainnet-beta.solana.com"],
  { apiUrl: "http://localhost:3001" },
);

console.log(connection.activeRpcUrl); // whichever URL actually won

// It's a real Connection — every normal web3.js call works as-is.
const slot = await connection.getSlot();

// The one extra real method: gate on Bridge Radar's real health score
// before a bridge-related operation.
const check = await connection.checkBridgeHealth("wormhole", 70);
if (!check.healthy) {
  throw new Error(`wormhole health is ${check.score ?? "unscored"} (need >= 70) — refusing to proceed`);
}
```

`checkBridgeHealth` never fabricates a score: if the bridge is real but has
never been scored (e.g. a registered bridge with no adapter watching it
yet), `score` is `undefined` and `healthy` is `false` — never a
false-positive "healthy" for "we don't know." A bridge id that doesn't
exist in the registry at all is a different, real failure: the underlying
API 404s and `checkBridgeHealth` propagates that as a thrown
`BridgeRadarError` (from `@bridge-radar/sdk`) rather than masking "invalid
id" as just another "unhealthy."

## API

- `createFailoverConnection(rpcUrls: string[], options?: { commitment?: Commitment; apiUrl?: string }): Promise<FailoverConnection>`
- `class FailoverConnection extends Connection` — a real `Connection`
  (`instanceof Connection` is `true`), plus:
  - `.activeRpcUrl: string` — the URL that actually won.
  - `.checkBridgeHealth(bridgeId: string, minScore = 70): Promise<BridgeHealthCheck>`
- `class BridgeRadarFetchError extends Error` — thrown when every RPC URL
  fails, or when `checkBridgeHealth()` is called without `apiUrl`.

Real source: [`packages/fetch/src/index.ts`](https://github.com/Hermit210/Bridge-radar-/blob/master/packages/fetch/src/index.ts).
