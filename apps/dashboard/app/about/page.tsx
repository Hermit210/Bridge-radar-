import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { DetectorGrid } from "@/components/detector-grid";
import { DocsSidebar, type DocsSection } from "@/components/docs-sidebar";
import { listRegistry } from "@/lib/api";

export const metadata = { title: "About — Bridge Radar" };

const REPO = "https://github.com/Hermit210/Bridge-radar-";

const linkClass =
  "text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent";

const SECTIONS: DocsSection[] = [
  { id: "overview", label: "Overview" },
  { id: "status", label: "What's live" },
  { id: "detectors", label: "Detectors" },
  { id: "surfaces", label: "Surfaces" },
  { id: "architecture", label: "Architecture" },
  { id: "finality", label: "Finality & Alpenglow" },
  { id: "open-source", label: "Open source" },
];

export default async function AboutPage() {
  const registry = await listRegistry().catch(() => null);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 lg:grid-cols-[180px_1fr] animate-fade-in">
      <aside className="hidden lg:block">
        <DocsSidebar sections={SECTIONS} />
      </aside>

      <article className="min-w-0 space-y-16">
        <section id="overview" className="scroll-mt-24 space-y-5">
          {registry && (
            <span className="badge inline-flex items-center gap-2">
              <span className="status-dot status-dot-green"></span>
              Currently monitoring {registry.summary.implemented} bridges on Solana mainnet
            </span>
          )}
          <h1 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
            About Bridge Radar
          </h1>
          <p className="text-[15px] leading-[1.75] text-text-secondary">
            Bridge Radar is a real-time bridge-health intelligence layer for
            Solana. It monitors every bridge with a Solana leg and exposes a
            single answer for users, dApps, and Foundation reviewers:{" "}
            <em className="text-text">is this bridge healthy right now?</em>
          </p>
          <p className="text-sm leading-relaxed text-muted-dark">
            Building an integration? Jump straight to{" "}
            <Link className={linkClass} href="/developers">
              Developer Tools
            </Link>{" "}
            for the SDK, REST/WebSocket API, embeddable widget, and on-chain oracle docs — this page
            covers what Bridge Radar is and how it's built.
          </p>
        </section>

        <Reveal>
          <section id="status" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
                What's live right now
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                A snapshot of what's real and running today, not aspirational — full detail in{" "}
                <Link className={linkClass} href={`${REPO}/blob/master/PROGRESS.md`}>
                  PROGRESS.md
                </Link>
                .
              </p>
            </div>
            <ul className="space-y-2.5">
              {[
                registry
                  ? `${registry.summary.implemented} bridges actively monitored on Solana mainnet, ${registry.summary.planned} more real bridges tracked with no verified adapter yet — see /bridges`
                  : "Bridge count unavailable right now — the registry API didn't respond.",
                "5 independent detectors feeding one weighted Health Score, real since 2026-08-01 (parity, outflow, signer, frontend, oracle).",
                "Postgres + TimescaleDB in production — deployed on Render, real hypertables, not the SQLite dev default.",
                <>
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">
                    @bridge-radar/sdk@0.2.0
                  </code>{" "}
                  published on npm, including Finality Watch's <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">getFinalityHealth()</code>.
                </>,
                "REST + WebSocket API live and publicly reachable — see /developers for real curl examples.",
                "On-chain oracle live on Solana Devnet — not mainnet yet, a deliberate real-funds decision not made.",
              ].map((content, i) => (
                <li
                  key={i}
                  className="glass-card-interactive flex items-start gap-3 p-4 text-sm text-text-secondary"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green" />
                  <span>{content}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        <Reveal>
          <section id="detectors" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Detectors</h2>
              <p className="mt-1.5 text-sm text-muted">
                Five independent detectors, weighted and composed into one real-time score.
              </p>
            </div>
            <DetectorGrid reveal={false} />
          </section>
        </Reveal>

        <Reveal>
          <section id="surfaces" className="scroll-mt-24 space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Surfaces</h2>
              <p className="mt-1.5 text-sm text-muted">Four real ways to consume Bridge Radar's data.</p>
            </div>
            <div className="space-y-2.5">
              {[
                <>This dashboard — bridge list, comparisons, live event feed, personal activity.</>,
                <>
                  REST + WebSocket API — free, open, no rate limiting currently enforced. Full docs,
                  real curl examples, and an embeddable health badge on{" "}
                  <Link className={linkClass} href="/developers">
                    /developers
                  </Link>
                  .
                </>,
                <>
                  On-chain Anchor program{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">radar-oracle</code>{" "}
                  on Solana Devnet. Program ID, real account layout, and a PDA-read example on{" "}
                  <Link className={linkClass} href="/developers">
                    /developers
                  </Link>
                  .
                </>,
                <>
                  Telegram + Discord + webhook alerter for anomaly events, plus a real Telegram bot
                  (<code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">@bruhalert_bot</code>
                  ) answering <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">/start</code>,{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">/status</code>, and{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">/help</code> by
                  long-polling Telegram's <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">getUpdates</code>,
                  plus a real automated weekly digest to every wallet linked via a real{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">/start</code>{" "}
                  deep link.{" "}
                  <span className="text-green">
                    Both outbound alert delivery (Discord: real HTTP 204; Telegram: a real reply with
                    a real message_id) and inbound bot commands are live-confirmed (2026-08-08)
                  </span>
                  .
                </>,
              ].map((content, i) => (
                <div
                  key={i}
                  className="glass-card-interactive flex items-start gap-3 p-4 text-sm text-text-secondary"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  <span>{content}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="architecture" className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Architecture</h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Rust cargo workspace for ingestion + scoring + attestation; pnpm
              workspace for API + dashboard; Anchor program for the on-chain
              oracle. Storage has two implementations behind the same
              interface on both sides — a Rust trait (SQLite / Postgres
              +Timescale) and a matching TypeScript interface in the API — with
              SQLite as the zero-setup dev default. Both backends are wired
              end-to-end and selected by <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">DATABASE_URL</code>: Postgres
              was verified live on 2026-08-08 (real indexed events, real
              computed health scores, real API responses, all off a running
              Timescale container). See{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">ARCHITECTURE.md</code>{" "}
              for the full breakdown.
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section id="finality" className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
              Finality & Alpenglow
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Solana is mid-transition from its current consensus (TowerBFT — a real, documented ~12.8s
              finality time) to a new consensus mechanism called{" "}
              <span className="text-text">Alpenglow</span>, built around a new voting protocol called{" "}
              <span className="text-text">Votor</span>, targeting ~150ms finality — roughly an 80-100x
              improvement. As of this writing, Alpenglow is not live on Solana mainnet: per{" "}
              <Link className={linkClass} href="https://solana.com/upgrades/alpenglow">
                Solana's own official upgrade page
              </Link>
              , it's being tested on a community cluster, with mainnet activation targeted for Q3 2026 —
              not yet confirmed live. Our own real observed data below is consistent with that: finality
              is still measuring in the ~12-second TowerBFT range, not the ~150ms Alpenglow target.
            </p>
            <p className="text-sm leading-relaxed text-text-secondary">
              This matters for bridges specifically: any bridge with a hardcoded assumption about how
              long finality takes (e.g. "wait for N confirmations before minting on the destination
              chain") could see that assumption become stale once Alpenglow activates — either
              unnecessarily conservative, or, during a mixed-validator-set transition period, genuinely
              inconsistent. <span className="text-text">Finality Watch</span> tracks this directly: it
              polls Solana's own documented{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">getSlot</code> RPC
              method at both <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">confirmed</code> and{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">finalized</code> commitment,
              records the real elapsed time between them, and flags a real anomaly only when an
              observation deviates 3x from a real trailing-hour baseline — relative to observed data,
              never a hardcoded assumption about which consensus version is currently active. See the
              live panel on the homepage, or{" "}
              <Link className={linkClass} href="/developers">
                GET /v1/network/finality
              </Link>{" "}
              for the real current numbers.
            </p>
            <p className="text-xs leading-relaxed text-muted-dark">
              This is descriptive infrastructure context, not a claim that Bridge Radar detects or
              prevents any specific incident — same rule as every other signal on this site.
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section id="open-source" className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
              Open source, public good
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              MIT (code), CC-BY 4.0 (docs). No token. No equity.
            </p>
          </section>
        </Reveal>
      </article>
    </div>
  );
}
