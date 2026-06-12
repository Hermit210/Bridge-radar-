import Link from "next/link";
export const metadata = { title: "About — Bridge Radar" };
export default function AboutPage() {
  return (
    <article className="max-w-3xl space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight">About Bridge Radar</h1>
      <p className="text-text-secondary leading-relaxed">
        Bridge Radar is a real-time bridge-health intelligence layer for
        Solana. It monitors every bridge with a Solana leg and exposes a
        single answer for users, dApps, and Foundation reviewers:{" "}
        <em className="text-text">is this bridge healthy right now?</em>
      </p>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Detectors</h2>
        <div className="section-divider mt-3" />
      </div>
      <div className="space-y-3">
        {[
          { name: "Parity", desc: "origin-side lock/unlock vs. Solana-side mint/burn." },
          { name: "Outflow", desc: "z-score over rolling 30-day distribution of 5-min bucket counts." },
          { name: "Signer-set drift", desc: "diffs the canonical signer registry per bridge." },
          { name: "Frontend hash", desc: "sha256 of each bridge's served bundle." },
          { name: "Oracle staleness", desc: "Pyth feed age per bridge dependency." },
        ].map((d) => (
          <div key={d.name} className="glass-card p-4 flex items-start gap-3 text-sm text-text-secondary">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <span>
              <span className="text-text font-medium">{d.name}</span> &mdash; {d.desc}
            </span>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Surfaces</h2>
        <div className="section-divider mt-3" />
      </div>
      <div className="space-y-3">
        {[
          <>This dashboard.</>,
          <>REST + WebSocket API &mdash; free, open, rate-limited.</>,
          <>On-chain Anchor program <span className="badge font-mono text-accent text-xs">radar-oracle</span> on Solana Devnet: <span className="badge font-mono text-accent text-xs">6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM</span></>,
          <>Telegram + Discord + webhook alerter for anomaly events.</>,
        ].map((content, i) => (
          <div key={i} className="glass-card p-4 flex items-start gap-3 text-sm text-text-secondary">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <span>{content}</span>
          </div>
        ))}
      </div>

      <div className="relative gradient-bg rounded-2xl overflow-hidden">
        <div className="relative z-10 p-8">
          <h2 className="text-2xl font-bold tracking-tight">Open source, public good</h2>
          <div className="section-divider mt-3 mb-4" />
          <p className="text-sm text-text-secondary leading-relaxed">
            MIT (code), CC-BY 4.0 (docs). No token. No equity. Built by Saloni Khan.{" "}
            <Link className="text-accent hover:text-accent-dim transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent" href="https://github.com/Hermit210/Bridge-radar-">
              Source on GitHub
            </Link>.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Architecture</h2>
        <div className="section-divider mt-3" />
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">
        Rust cargo workspace for ingestion + scoring + attestation; pnpm
        workspace for API + dashboard; Anchor program for the on-chain
        oracle. Storage trait abstracted over SQLite (dev) and
        Postgres+Timescale (prod). See{" "}
        <Link className="text-accent hover:text-accent-dim transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent" href="https://github.com/Hermit210/Bridge-radar-/blob/master/ARCHITECTURE.md">
          ARCHITECTURE.md
        </Link>.
      </p>
    </article>
  );
}
