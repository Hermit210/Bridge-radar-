# Bridge Discovery — Candidate Verification (2026-07-22)

Research pass over the 14-bridge candidate list, per the user's instructions:
verify every program ID against official docs/GitHub, then confirm it's a
real, currently-deployed, executable program via a **direct Solana mainnet
RPC call** (`getAccountInfo`) — never trust a scraped page or a search
summary alone. Two addresses below were first surfaced by an AI-summarized
page fetch; both were independently confirmed against mainnet RPC before
being included here. Where no program ID could be verified from an
authoritative source, it is marked **not-found** — not guessed.

This document only reports findings. **No adapter code has been written.**

---

## Summary table

| displayName | bridgeDbName | chains (as found) | is-genuine-bridge | solana-program-id | status |
|---|---|---|---|---|---|
| Relay | relay | Solana, Ethereum, Base, Arbitrum, + 75 more (per their own count) | yes | **verified** (3 programs, see below) | ready for adapter |
| Across Protocol | across | Solana, Ethereum, Arbitrum, Optimism, Base, Polygon, and other EVM L2s | yes | **verified** | ready for adapter |
| Chainlink CCIP | ccip | Solana, Ethereum, Base, + 20+ EVM chains (generic messaging protocol) | yes | **verified** | ready, but see shared-infra note below |
| Wan Bridge (Wanchain) | wanbridge | Solana, VeChain, Ethereum, Bitcoin, XRP Ledger, Wanchain, 35+ chains total | yes | **not-found** | blocked — no verifiable address |
| Garden Finance | garden | Bitcoin, Solana, Ethereum, Arbitrum, Base, Starknet, Sui, Tron, Litecoin | yes | **verified** | ready for adapter |
| Interport Finance | interport | Solana + EVM chains (via LayerZero/CCIP) | **no** | n/a | excluded — not a dedicated bridge |
| Orderly Network Bridge | orderly | Solana, Arbitrum, Optimism, Ethereum, Base, Mantle, Sonic, NEAR | yes | **not-found** (mainnet) | blocked — only devnet/localnet IDs found |
| Coinbase Bridge (Base↔Solana) | base-solana-bridge | Solana, Base | yes | **verified** (2 programs) | ready for adapter — see note |
| NEAR Intents | — | n/a | **no** | n/a | excluded — intent/solver system, not a bridge |
| UniversalX | — | n/a | **no** | n/a | excluded — trading UI, not a bridge |
| PowerFlow | — | n/a | **not found** | n/a | excluded — no evidence this project exists |
| WavesBridge | wavesbridge | Solana (SPL), Ethereum (ERC20), + others | yes | **not-found** | blocked — no verifiable address |
| CookieChain Bridge | — | n/a | **not found** | n/a | excluded — no evidence this project exists |
| BabyDoge Bridge | babydoge-bridge | BNB Chain, Solana, Base | yes | **not-found** (bridge program) | blocked — only the SPL token mint was disclosed, not a bridge program; possibly centralized/custodial |

---

## Details, per candidate

### ✅ Relay (relay.link) — verified

Real, general-purpose cross-chain depository protocol. Solana implementation
is an Anchor program family, source at
[relayprotocol/relay-settlement](https://github.com/relayprotocol/relay-settlement)
(`packages/depository/packages/solana-vm/`). Mainnet program IDs come
straight from that repo's `Anchor.toml`, `[programs.mainnet]` section:

| Program | Address |
|---|---|
| `relay_depository` | `99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2` |
| `relay_forwarder` | `DPArtTLbEqa6EuXHfL5UFLBZhFjiEXWRudhvXDrjwXUr` |
| `deposit_address` | `H2RS2tansewENdGqaPfF4maSjSWJE3KToVsb2tfmehd9` |

All three confirmed `executable: true`, owned by `BPFLoaderUpgradeab1e...`
via direct `getAccountInfo` RPC calls against `api.mainnet-beta.solana.com`.

### ✅ Across Protocol — verified

Real, well-established intent-based bridge, expanded to Solana via an
"SVM SpokePool." Program ID confirmed from the official
[Solana migration guide](https://docs.across.to/introduction/migration-guides/solana-migration-guide):

| Program | Address |
|---|---|
| `svm_spoke` (SpokePool) | `DLv3NggMiSaef97YCkew5xKUHDh13tVGZ7tydt3ZeAru` |

Confirmed executable via direct RPC.

### ✅ Chainlink CCIP — verified, with a caveat

CCIP went live on Solana mainnet in 2025 per Chainlink's own announcements
and `docs.chain.link`. Router program ID:

| Program | Address |
|---|---|
| CCIP Router | `Ccip842gzYHhvdDkSyi2YVCoAWPbYJoApMFzSxQroE9C` |

Confirmed executable via direct RPC.

**Caveat for Task 3 design**: CCIP is generic cross-chain *messaging*
infrastructure, not a single-purpose bridge. Both the Coinbase/Base-Solana
Bridge and Interport Finance (excluded above) route through CCIP. If we
build a CCIP adapter that watches the Router program, we will also see
traffic belonging to every other CCIP-based bridge unless we can
distinguish by token-pool/receiver program or an on-chain tag. Needs a
decision before adapter work starts: track CCIP as its own bridge, or only
track it indirectly through each downstream bridge's own token-pool
program (e.g. Base-Solana Bridge's dedicated program, which is separate
from the generic Router and was verified independently above).

### ⚠️ Wan Bridge (Wanchain) — genuine, but no program ID found

Real, official Wanchain product — announced via their own Medium/press
channels ("Wanchain Launches Solana Bridge"), with supporting GitHub repos
(`wanchain/solana-mapping`, `wanchain/solana-xport-demo`,
`wanchain/bridge-contract`, `wanchain/crossBtc`). The `solana-mapping` repo
only contains token metadata, not a program address, and no press
release/explorer link disclosing the actual storeman/bridge program
address turned up in a reasonable search. **Not fabricating one** — marking
not-found. If you have a specific transaction hash or Wanchain support
contact that names the address, that would unblock this.

### ✅ Garden Finance — verified

Real Bitcoin-native cross-chain bridge (HTLC-based atomic swaps, backed by
$2B+ volume per their own docs, integrators include Coinbase/MetaMask/
Phantom/Kraken/Ledger). Program ID pulled directly from Garden's own SDK
source, not a docs page:
[`gardenfi/garden.js`](https://github.com/gardenfi/garden.js),
`packages/core/src/lib/constants.ts`:

| Program | Address |
|---|---|
| `solana_native_swaps` (mainnet) | `2bag6xpshpvPe7SJ9nSDLHpxqhEAoHPGpEkjNSv7gxoF` |

Confirmed executable via direct RPC.

### ❌ Interport Finance — not a genuine dedicated bridge

DeFiLlama's own listing describes it plainly: *"By utilizing cross-chain
messaging, Interport eliminates the need for traditional bridges."* It's a
swap aggregator riding on LayerZero and Chainlink CCIP messaging, with no
dedicated lock/mint contract of its own on Solana. This matches the
exclusion criteria you gave me (DEX/aggregator mislabeled as a bridge) —
recommend NOT building an adapter for this; any activity it generates would
already be visible through the LayerZero or CCIP adapters.

### ⚠️ Orderly Network Bridge — genuine, mainnet address unconfirmed

DeFiLlama tracks "Orderly Bridge" as a distinct entry from "Orderly Perps"/
"Orderly Chain," and the vault program is real and open-source:
[`OrderlyNetwork/solana-vault`](https://github.com/OrderlyNetwork/solana-vault).
However, that repo's `Anchor.toml` only declares `[programs.devnet]` and
`[programs.localnet]` addresses — **no `[programs.mainnet]` section is
present**. A November 2024 industry article (Yellow.com) explicitly
describes the vault as being "on Solana Testnet" as of that writing. I am
not treating the devnet ID as a stand-in for mainnet. Marking not-found
until a confirmed mainnet address turns up.

### ✅ Coinbase Bridge → really "Base-Solana Bridge" — verified, reconsider excluding it

Your instinct that this is "likely Base-chain specific, not Solana" turned
out to be only half right: it's real, it's live (launched Dec 4, 2025), and
Solana genuinely is one of its two legs — it moves SOL/SPL assets between
Base and Solana, secured jointly by Coinbase and Chainlink CCIP node
operators. Program IDs from the official
[Base docs](https://docs.base.org/base-chain/quickstart/base-solana-bridge):

| Program | Address |
|---|---|
| Bridge Program (mainnet) | `HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM` |
| Base Relayer Program (mainnet, optional convenience layer) | `g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9` |

Both confirmed executable via direct RPC — this took two independent
verification passes since the first page fetch's summary wasn't
corroborated by my own raw-text scrape of the same URL (likely a JS
rendering difference, not a hallucination, but I didn't take the address on
faith either way). Recommend including this one; it's real and currently
live, unlike the assumption in the original brief.

### ❌ NEAR Intents — not a genuine dedicated bridge

Confirmed: this is an MPC-based intent-settlement/solver network (users
state a desired outcome, solvers compete to fill it), not a lock-mint
bridge contract. Matches your own assessment exactly — excluded.

### ❌ UniversalX — not a genuine bridge

Confirmed: a chain-abstraction trading platform by Particle Network,
explicitly marketed as "trade without bridging" — a UX/aggregation layer
over other infrastructure, not a bridge itself. Matches your own
assessment — excluded.

### ❌ PowerFlow — no evidence found

Multiple search variations turned up nothing identifying a real, current
Solana bridge project by this name. Excluded for lack of evidence. If you
have a specific link or contract in mind, send it and I'll re-check.

### ⚠️ WavesBridge — genuine, but no program ID found

Real, currently operating bridge at wavesbridge.io ("transfer ERC20, SPL,
and many more tokens"), corroborated independently by Allbridge's own
partnership announcement and third-party bridge-ranking sites. Its own
site and a GitHub search turned up no disclosed Solana program address.
Marking not-found rather than guessing.

### ❌ CookieChain Bridge — no evidence found

No search result, official site, or GitHub repo found for a project by
this name in connection with Solana bridging. Excluded for lack of
evidence — this may be a misremembered name; let me know if you have a
source.

### ⚠️ BabyDoge Bridge — genuine and active, but no bridge *program* found — caution flag

Real and currently active (`bridge.babydoge.com`, BNB Chain ↔ Solana ↔
Base), confirmed via BabyDoge's own official X/Twitter account and several
independent crypto news outlets. However, the only Solana address BabyDoge
themselves disclosed is the **SPL token mint**
(`7dUKUopcNWW6CcU4eRxCHh1uiMh32zDrmGf6ufqhxann`) — that's the token being
bridged, not a bridge program. No dedicated on-chain bridge program was
found. This is consistent with many small memecoin bridges running as a
custodial/centralized hot-wallet operation rather than a verifiable Anchor
program, which would make on-chain detection unreliable or impossible
regardless. Flagging this as lower-priority and higher-risk even if a
program address surfaces later.

---

## Recommendation for Task 3 (pending your approval)

**Ready to build adapters for (3, all mainnet-verified):**
Relay, Across Protocol, Garden Finance, and Coinbase/Base-Solana Bridge (4
if you want to include it — recommend yes, see note above).

**Blocked, no fabricated placeholder — need either your input or more
research time:** Wan Bridge, Orderly Network Bridge, WavesBridge, BabyDoge
Bridge.

**Excluded, not genuine dedicated bridges:** Interport Finance, NEAR
Intents, UniversalX.

**Excluded, no evidence the project exists:** PowerFlow, CookieChain
Bridge.

**Open design question before Task 3 starts:** how to handle Chainlink
CCIP — track it as its own bridge (risking overlap with Base-Solana Bridge
and any other CCIP-based bridge we add later), or only track downstream
bridges' own token-pool programs and treat CCIP Router traffic as
supporting context, not a primary detection target.

---

## Pass 2 — exhaustive ecosystem sweep (2026-07-23)

Wider search per the user's request: Solana Foundation ecosystem coverage,
Alchemy's "39 web3 bridges on Solana" list, and what Jupiter/Rango/Phantom's
LI.FI-powered swapper route through. Same rules as pass 1: no guessed
program IDs, official source + direct mainnet RPC confirmation before
anything is trusted, aggregators/DEXs/LSTs excluded the same way Orca/
Marinade/Jito/Phantom Bridge were in the registry audit.

### ✅ Atomiq Exchange (formerly SolLightning) — verified, adapter built

Real, audited (Ackee Blockchain & CSC), immutably-deployed (no upgrade
authority) trustless Bitcoin ↔ Solana swap protocol using submarine swaps +
an on-chain Bitcoin SPV light client. DeFiLlama itself categorizes it
`Cross Chain Bridge` (confirmed live via `api.llama.fi/protocols`, slug
`atomiq-exchange`, ~$364K TVL at check time).

Program ID from the project's own GitHub (`adambor/SolLightning-program`,
`Anchor.toml`, `[programs.mainnet]`):

| Program | Address |
|---|---|
| `swap_program` | `4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM` |

Confirmed `executable: true` via direct `getAccountInfo`. The official docs
site doesn't publish the program ID or a clean instruction reference, so the
Lock/Unlock mapping was derived empirically from real mainnet transactions
(`OffererInitialize(PayIn)` = Lock, `ClaimerClaim(PayOut)` = Unlock,
`OffererRefund`/`WriteData`/`InitData` = not transfers, ignored) — see
`crates/radar-core/src/bridges/atomiq.rs` doc comment for the four Solscan
transaction links used. Adapter built, 5 unit tests from real transactions,
registered in `bridges::registry()`, seeded enabled in both DB seed paths.

### ✅ rhino.fi — verified, adapter built

Real, non-custodial cross-chain bridge (formerly DeversiFi) moving assets
between Solana and 35+ EVM/L2 chains. DeFiLlama independently categorizes it
`Bridge` (confirmed live via `api.llama.fi/protocols`, slug `rhino.fi`,
~$1.12M TVL at check time).

Program ID from rhino.fi's own official docs
(<https://docs.rhino.fi/general/contract-addresses>, "Solana" row —
cross-checked with two independent fetches of the same page before being
trusted, per this project's standing rule about not trusting a single
AI-summarized fetch):

| Program | Address |
|---|---|
| bridge program | `FCW1uBM3pZ7fQWvEL9sxTe4fNiH41bu9DWX4ErTZ6aMq` |

Confirmed `executable: true` via direct `getAccountInfo`. Unlike Atomiq, the
instruction set came through immediately and cleanly from real, very recent
mainnet transactions: `DepositWithId` (Lock) and `Withdraw` (Unlock) — see
`crates/radar-core/src/bridges/rhinofi.rs` doc comment for the two Solscan
transaction links used. Adapter built, 4 unit tests from real transactions,
registered in `bridges::registry()`, seeded enabled in both DB seed paths.

### ⚠️ Zeus Network — real programs confirmed, adapter blocked for now

Real, actively-covered Bitcoin ↔ Solana bridge (Zeus Program Library / ZPL —
a "Layer 1.5" letting BTC be programmable on Solana via a Guardian-signed
two-way peg). Six ZPL program addresses were surfaced by search
(Bootstrapper, BitcoinSPV, LayerCA, Delegator, LiquidityManagement,
TwoWayPeg) and **all six independently confirmed** `executable: true` via
direct `getAccountInfo`, all owned by the upgradeable BPF loader, all
sharing a consistent "ZPL" vanity-address prefix. `TwoWayPeg`
(`ZPLzxjNk1zUAgJmm3Jkmrhvb4UaLwzvY2MotpfovF5K`) is genuinely live — real
transactions land every few seconds — and a real fetched transaction's own
log text ("Updated Two-way Peg Configuration") independently corroborates
the name↔address mapping.

**Why no adapter yet:** the official docs site
(`docs.zeusnetwork.xyz` / `zeus-network.gitbook.io`) returned HTTP 522
errors and an auth-walled GitBook redirect throughout this session — never
successfully loaded, so the real IDL/instruction reference couldn't be
read first-party. Scanning 40 recent `TwoWayPeg` transactions found only
`UpdateMinerFeeRate` (a config/admin operation) in readable
`Program log: Instruction: X` text — no plain-text deposit/withdraw
instruction name turned up in the sample, meaning the actual peg-in/peg-out
event format likely needs IDL-based (Anchor discriminator) decoding rather
than the plain-text pattern our other adapters use. Building a decoder
without confirming the real event format first would risk exactly the kind
of guessed/undertested code this project explicitly forbids. **Marking
blocked, not not-found** — the programs are real and verified; revisit once
the docs site is reachable or a deposit/withdraw transaction with readable
instruction text turns up.

### ❌ Excluded — aggregators/UI layers, not dedicated bridges

Same exclusion class as Interport Finance/UniversalX/Jupiter/Phantom Bridge
in the registry audit — each of these computes routes across *other*
bridges rather than operating a dedicated lock-mint or HTLC contract of its
own:

- **Jupiter** — Solana's DEX aggregator; cross-chain feature routes through Wormhole/Mayan/deBridge.
- **Rango Exchange** — aggregator, "170+ DEX/Bridge Protocols" under one UI.
- **LI.FI** / **Jumper.Exchange** (LI.FI's own frontend) — aggregator; explicitly powers Phantom's Cross-Chain Swapper.
- **Squid Router** — aggregator built on Axelar's messaging (already tracked directly).
- **Bridgers.xyz** — "non-custodial cross-chain liquidity aggregator... across DEXs and bridges."
- **Houdini Swap** — "non-custodial liquidity aggregator" adding privacy on top of other bridges/exchanges.
- **SwapKit** — THORChain-ecosystem swap aggregator UI.
- **Sunrise DeFi** — built by Wormhole Labs on Wormhole's own NTT framework; would double-count with Wormhole/Portal.
- **DEFIWAY** — reads as a bridge-comparison/directory site rather than an operator of its own dedicated bridge contract.

### ❌ Excluded — custodial swap services, not on-chain bridge programs

- **SideShift.ai** — wallet-to-wallet instant-exchange service; briefly takes custody during the swap rather than running a verifiable on-chain lock-mint/HTLC program. Same caution-flag reasoning as BabyDoge Bridge in pass 1.

### ⚠️ Chainflip — real, verified programs, adapter blocked (architecture mismatch)

Chainflip has genuine native Solana support. Both programs verified from
official docs (<https://docs.chainflip.io/brokers/vault-swaps-api/solana>,
cross-checked with two independent fetches) and confirmed `executable: true`
via direct RPC:

| Program | Address |
|---|---|
| SwapEndpoint | `4FVuGMuzuFAo5KWLnVNknDkNZ84er2wcrtJ79pfyoZqH` |
| Vault | `AusZPVXPoUM8QJJ2SL4KwvRGCQ22cDg6Y4rg7EvFrxi7` |

**Why no adapter:** scanning real transactions shows `SwapEndpoint` has had
only 6 transactions *ever* since its January 2025 deployment — all IDL setup,
zero swaps. `Vault` is genuinely active (`FetchTokens`/`TransferTokens`/
`FetchNative`, very recent activity), but those are validator-side settlement
operations, not user deposit events: Chainflip's actual "vault swap" deposit
leg is a user sending a raw SOL/SPL transfer to a per-swap ephemeral deposit
address, which never invokes either program directly. Our indexer watches
*program IDs*, not arbitrary destination addresses, so we would only ever
see the settlement half of each swap (`Fetch`/`Transfer`) and never the
actual inbound deposit — producing a permanently one-sided, misleading
parity picture rather than an honest one. Not building this rather than
shipping a structurally-incomplete detector.

### ⚠️ Router Nitro (Router Protocol) — real, audited, program ID not public

Router Nitro's Solana integration (Gateway, Asset Forwarder, Asset Bridge
contracts) is real and was professionally audited by Oak Security GmbH
(audit report in `router-protocol/audit-reports` on GitHub, September 2024,
7 critical findings all resolved). However:
- The three contract repositories referenced in the audit
  (`router-protocol/asset-bridge-contracts`, `asset-forwarder-contracts`,
  `asset-gateway-contracts`) are **private** — the audit report links to them
  but they 404 via the GitHub API.
- Router's public `nitro-tokens` config repo only lists token *mint*
  addresses (USDC/USDT), never the bridge program address itself.
- No independent source (Solscan, block explorers, docs) surfaced a mainnet
  program ID either.

Confirmed real and audited, but there is no address to verify against RPC —
marking blocked, not fabricating one.

### ❌ Carrier (Automata Network) — deprioritized, likely discontinued

A real token/NFT bridge product built on Wormhole's guardian messaging,
historically. However, Automata Network's current GitHub org (146
repositories) has nothing named "Carrier" or "bridge" — their org is now
entirely TEE/attestation/ZK infrastructure, suggesting Carrier was sunset or
spun out. No program ID findable; also would likely have shared detection
surface with Wormhole even if found (same open question as CCIP above).
Excluded for this pass.

### ❌ AllDomains Bridge — not a separate bridge, built on Hyperlane

Per AllDomains' own docs (<https://docs.alldomains.id/protocol/alldomains-bridge>):
*"With Hyperlane as our trusted provider, you can bridge with confidence."*
This is a Hyperlane-based application, not a dedicated bridge contract of its
own — the same "shares infra with an already-tracked bridge" reasoning as
Carrier/Wormhole and CCIP's downstream bridges. Once Hyperlane itself gets a
verified adapter (see Tier 2 in `BRIDGE_REGISTRY.md`), AllDomains' traffic
would already be visible through it. Excluded, not a new candidate.

### ❌ No evidence found — not fabricating, not building

Mach Exchange, ValueRouter, Galaxy Exchange, LibertySwap, Maxbid Pro, HOT
Protocol, Emblem Vault (reads as a low-evidence AI-trading-terminal/token
project rebrand rather than a serious dedicated bridge), Hop Protocol
(confirmed EVM-L2-only, no Solana leg at all), Celer cBridge (Solana support
was announced for "cBridge 2.0" in 2021-2022 with no evidence it ever
shipped).

---

## Pass 2 summary

Candidate pool from the Alchemy "39 web3 bridges on Solana" list plus
aggregator-revealed bridges, fully triaged:

| Outcome | Bridges |
|---|---|
| **Adapter built, live on mainnet** | Atomiq Exchange, rhino.fi |
| **Real, verified programs — blocked** (docs unreachable / no readable event format / architecture mismatch) | Zeus Network, Chainflip |
| **Real, audited — blocked** (program ID not publicly disclosed) | Router Nitro |
| **Excluded — aggregator/UI, not a dedicated bridge** | Jupiter, Rango Exchange, LI.FI, Jumper.Exchange, Squid Router, Bridgers.xyz, Houdini Swap, SwapKit, Sunrise DeFi, DEFIWAY |
| **Excluded — custodial swap service** | SideShift.ai |
| **Excluded — shares infra with an already-tracked bridge** | Carrier (Wormhole), AllDomains Bridge (Hyperlane) |
| **Excluded — confirmed no Solana leg / never shipped** | Hop Protocol, Celer cBridge |
| **No evidence found** | Mach Exchange, ValueRouter, Galaxy Exchange, LibertySwap, Maxbid Pro, HOT Protocol, Emblem Vault |

This is a natural stopping point for this pass: every remaining unresolved
candidate is either genuinely unverifiable from an authoritative source
(Router Nitro), architecturally incompatible with our program-ID-based log
detection (Chainflip), blocked on an unreachable docs site with no readable
on-chain event format (Zeus Network), or resolves into a bridge already in
the registry (Carrier/Wormhole, AllDomains/Hyperlane). Revisit Zeus Network
and Chainflip if their docs situations change; revisit Router Nitro if a
program ID surfaces.

---

## Pass 3 (2026-07-23) — Cashmere/InterSoon verification, retries, one new bridge

Per the two names surfaced on `defillama.com/bridges/solana` that hadn't
been checked yet, plus a retry pass on everything pass 2 left blocked.

### ✅ Orderly Network — verified, adapter built (previously blocked in pass 1)

Pass 1 blocked this on 2026-07-22 because `OrderlyNetwork/solana-vault`'s
`Anchor.toml` only declared `[programs.devnet]`/`[programs.localnet]`, no
mainnet section. Retried this session: Orderly has since shipped to Solana
mainnet.

Program verified from Orderly's own official docs
(<https://orderly.network/docs/build-on-omnichain/addresses>, "Solana-Vault"
row under the Mainnet table — cross-checked with two independent fetches,
each returning the identical address):

| Program | Address |
|---|---|
| Solana-Vault | `ErBmAD61mGFKvrFNaTJuxoPwqrS8GgtwtqJTJVjFWx9Q` |

Confirmed `executable: true` via direct `getAccountInfo`, and genuinely
live — real transactions land every 10-15 minutes. DeFiLlama independently
tracks it as "Orderly Bridge" (slug `orderly-bridge`, category "Bridge",
~$23.7M TVL, Solana among its chains).

Instructions confirmed from real transactions: `DepositSol`/`Deposit` (user
collateral locked into the vault) and `LzReceive` (inbound LayerZero
message from Orderly Chain — one sampled `LzReceive` transaction shows a
nested SPL Token transfer moving real funds out of the vault, confirming
it's a genuine withdrawal path, not assumed from the name). Adapter built,
5 unit tests from 3 real transactions, registered in `bridges::registry()`,
seeded enabled. Live-verified: indexer subscribed and ingested a real
`kind="lock"` event within 2 minutes of restart.

### ❌ Cashmere — real program, but a thin CCTP wrapper

`defillama.com/bridges/solana` lists "Cashmere." DeFiLlama's own
`/protocols` entry: category "Bridge", but `tvl: null`, `chains: []` — no
live tracked data. Official docs
(<https://docs.cashmere.exchange/developers/contract-addresses>) give a
"Cashmere CCTP" main program:

| Program | Address |
|---|---|
| Cashmere CCTP (main) | `5RsvKL6LFq6yEFiAXEwgYHAN3aLFypeB4AaafdeDnHqM` |

Confirmed `executable: true`, and has real (if infrequent) activity. But
every one of 3 sampled real transactions shows the same pattern: Cashmere's
own `TransferV2` instruction immediately invokes Circle's actual CCTP
programs — `CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe`'s `DepositForBurn`
then `CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC`'s `SendMessage` — the
exact real CCTP burn-and-mint flow, not Cashmere's own lock/mint logic.
Example: <https://solscan.io/tx/48fpikZdjEQSzjEBvxuRXG1iKcZwE6nRypaoQu9U5JY5kJ6SFzfkC4UY2ovdC9BvVNeYHJMxvquwYj7DteDHxK8G>.
Building a separate "cashmere" adapter watching Cashmere's wrapper program
would double-count every transfer once "cctp" gets a real adapter (both
would fire on the same underlying CCTP burn). Excluded — shares infra with
CCTP, same reasoning as Carrier/Wormhole and AllDomains/Hyperlane.

### ❌ InterSoon — not a separate bridge, built on Hyperlane

InterSOON (SOON Network's TON↔Solana bridge) per its own official docs
(<https://docs.soo.network/introduction/intersoon>): *"InterSOON's
underlying cross-chain messaging is supported by Hyperlane."* Same
exclusion reasoning as AllDomains Bridge — no dedicated program of its own,
resolves into Hyperlane once that bridge gets a verified adapter. No
GitHub org found with a dedicated "intersoon" bridge repo either
(`soonlabs`'s public `soon-bridge-tool` is for the SOON L1↔L2 rollup
bridge, a different product). Excluded.

### Retries on pass-2/pass-1 blocked candidates

- **Zeus Network** — found the official `@zeus-network/zpl-sdk` npm
  package (v0.11.6), which exposes real instruction names on the
  `TwoWayPeg` program not previously seen: `CreateHotReserveBucket`,
  `ReactivateHotReserveBucket`, `AddWithdrawalRequest`,
  `AddWithdrawalRequestWithAddressType`, `CreateEntityDerivedReserveAddress`,
  `MigrateHotReserveBucketToEntityDerivedReserveAddress` — a genuine step
  forward on understanding the program's real interface. However, these use
  raw Borsh instruction discriminators (sequential integers via
  `@solana/buffer-layout`), not Anchor's typical human-readable
  `msg!("Instruction: X")` logging our decoders rely on — a scan of the
  most recent transactions for these specific instruction names timed out
  against public RPC rate limits this session before finding a real sample
  of any of them (only administrative `UpdateMinerFeeRate` calls were
  confirmed with readable log text in earlier sampling). Still blocked —
  real programs, better-understood interface, but no confirmed readable
  deposit/withdrawal transaction sample yet. Revisit with a paid RPC
  provider (higher rate limits) to properly scan for one.
- **Chainflip** — scanned 600 real transactions against the Vault program
  (up from a handful previously). Confirmed the full instruction set is
  exactly `FetchTokens`, `FetchNative`, `TransferTokens`, `RotateAggKey` —
  no settlement/execution/finalization instruction exists anywhere in that
  set. This closes the question raised this session ("does a
  settlement/finalization instruction exist"): it doesn't. Confirms the
  pass-2 conclusion with much stronger evidence — still blocked,
  architecture mismatch (swap execution happens off-chain in Chainflip's
  validator network; the Vault only does custody operations).
- **Router Nitro** — checked GitHub deployment configs
  (`nitro-tokens/src/mainnet/tokens/*.json` — token mint addresses only,
  no bridge program address), the Router-Nitro-Cookbook's educational
  content (no addresses, and its one dApp example is EVM-only, using an
  ABI not an IDL), and npm (no `@routerprotocol` Solana SDK package found).
  Still blocked — the three contract repos named in Router's own Oak
  Security audit remain private.
- **Wan Bridge, WavesBridge, BabyDoge Bridge** — fresh searches this
  session surfaced no new information beyond pass 1's findings. Wan Bridge
  and WavesBridge: still no disclosed program address from any source.
  BabyDoge: still only the SPL token mint (`7dUKUopcNWW6CcU4eRxCHh1uiMh32zDrmGf6ufqhxann`)
  and a Raydium liquidity pool address are disclosed — no bridge *program*.
  All three remain not-found, unchanged.

### Pass 3 summary

| Outcome | Bridges |
|---|---|
| **Adapter built, live on mainnet** | Orderly Network |
| **Excluded — shares infra with an already-tracked bridge** | Cashmere (CCTP), InterSoon (Hyperlane) |
| **Still blocked, re-confirmed with stronger evidence** | Zeus Network, Chainflip, Router Nitro |
| **Still not-found, unchanged** | Wan Bridge, WavesBridge, BabyDoge Bridge |

After three passes, the registry holds 14 bridges with real, live adapters
and 2 (CCTP, Hyperlane) honestly marked unmonitored. Every candidate this
project's discovery process has touched is accounted for in this document
— built, blocked-with-a-documented-reason, excluded-with-a-documented-
reason, or not-found-and-not-guessed. Continuing further would mean
re-trying the same blocked/not-found candidates without new information
sources, or searching for increasingly obscure projects with no
verification path — a reasonable stopping point until new leads surface
(a working RPC provider with higher rate limits, a docs site coming back
online, or a project publicly disclosing a program address it hasn't yet).
public program ID surfaces.
