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
