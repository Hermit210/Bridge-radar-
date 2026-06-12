import Link from "next/link";
export const metadata = { title: "About — Bridge Radar" };
export default function AboutPage() {
  return (
    <article className="max-w-3xl space-y-8 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight">About Bridge Radar</h1>
      <p className="text-text-secondary leading-relaxed">
        Bridge Radar is a real-time bridge-health intelligence layer for
        Solana. It monitors every bridge with a Solana leg and exposes a
        single answer for users, dApps, and Foundation reviewers:{" "}
        <em className="text-text">is this bridge healthy right now?</em>
      </p>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Detectors</h2>
        <div className="mt-4 space-y-2">
          {[
            { name: "Parity", desc: "origin-side lock/unlock vs. Solana-side mint/burn." },
            { name: "Outflow", desc: "z-score over rolling 30-day distribution of 5-min bucket counts." },
            { name: "Signer-set drift", desc: "diffs the canonical signer registry per bridge." },
            { name: "Frontend hash", desc: "sha256 of each bridge's served bundle." },
            { name: "Oracle staleness", desc: "Pyth feed age per bridge dependency." },
          ].map((d) => (
            <div key={d.name} className="glass-card p-4 flex items-start gap-3 text-sm text-text-secondary">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <span>
                <span className="text-text font-medium">{d.name}</span> — {d.desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Surfaces</h2>
        <div className="mt-4 space-y-2">
          {[
            <>This dashboard.</>,
            <>REST + WebSocket API — free, open, rate-limited.</>,
            <>On-chain Anchor program <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">radar-oracle</code> on Solana Devnet: <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM</code></>,
            <>Telegram + Discord + webhook alerter for anomaly events.</>,
          ].map((content, i) => (
            <div key={i} className="glass-card p-4 flex items-start gap-3 text-sm text-text-secondary">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <span>{content}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Open source, public good</h2>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          MIT (code), CC-BY 4.0 (docs). No token. No equity. Built by Saloni Khan.{" "}
          <Link className="text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent" href="https://github.com/Hermit210/Bridge-radar-">
            Source on GitHub
          </Link>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Architecture</h2>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          Rust cargo workspace for ingestion + scoring + attestation; pnpm
          workspace for API + dashboard; Anchor program for the on-chain
          oracle. Storage trait abstracted over SQLite (dev) and
          Postgres+Timescale (prod). See{" "}
          <Link className="text-accent hover:text-accent-bright transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent" href="https://github.com/Hermit210/Bridge-radar-/blob/master/ARCHITECTURE.md">
            ARCHITECTURE.md
          </Link>.
        </p>
      </section>
    </article>
  );
}
