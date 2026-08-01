import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { DetectorGrid } from "@/components/detector-grid";
import { listRegistry } from "@/lib/api";

export const metadata = { title: "About — Bridge Radar" };

const linkClass =
  "text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent";

export default async function AboutPage() {
  const registry = await listRegistry().catch(() => null);

  return (
    <article className="mx-auto max-w-3xl space-y-14 animate-fade-in">
      <div className="space-y-5">
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
      </div>

      <Reveal>
        <section className="space-y-4">
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
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Surfaces</h2>
          <div className="space-y-2.5">
            {[
              <>This dashboard.</>,
              <>REST + WebSocket API — free, open, rate-limited.</>,
              <>
                On-chain Anchor program{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">radar-oracle</code>{" "}
                on Solana Devnet:{" "}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent">
                  6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM
                </code>
              </>,
              <>Telegram + Discord + webhook alerter for anomaly events.</>,
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
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">
            Open source, public good
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            MIT (code), CC-BY 4.0 (docs). No token. No equity. Built by Saloni Khan.{" "}
            <Link className={linkClass} href="https://github.com/Hermit210/Bridge-radar-">
              Source on GitHub
            </Link>
            .
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-text">Architecture</h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            Rust cargo workspace for ingestion + scoring + attestation; pnpm
            workspace for API + dashboard; Anchor program for the on-chain
            oracle. Storage trait abstracted over SQLite (dev) and
            Postgres+Timescale (prod). See{" "}
            <Link className={linkClass} href="https://github.com/Hermit210/Bridge-radar-/blob/master/ARCHITECTURE.md">
              ARCHITECTURE.md
            </Link>
            .
          </p>
        </section>
      </Reveal>
    </article>
  );
}
