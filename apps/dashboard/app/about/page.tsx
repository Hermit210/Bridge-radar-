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
        <h2 className="text-xl font-bold tracking-tight">Detectors</h2>
        <div className="mt-2 h-0.5 w-8 rounded-full bg-accent/50" />
      </div>
      <ul className="list-none space-y-2 text-sm text-text-secondary">
        <li className="flex gap-2"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span><span className="text-text font-medium">Parity</span> — origin-side lock/unlock vs. Solana-side mint/burn.</span></li>
        <li className="flex gap-2"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span><span className="text-text font-medium">Outflow</span> — z-score over rolling 30-day distribution of 5-min bucket counts.</span></li>
        <li className="flex gap-2"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span><span className="text-text font-medium">Signer-set drift</span> — diffs the canonical signer registry per bridge.</span></li>
        <li className="flex gap-2"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span><span className="text-text font-medium">Frontend hash</span> — sha256 of each bridge&apos;s served bundle.</span></li>
        <li className="flex gap-2"><span className="text-accent mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span><span className="text-text font-medium">Oracle staleness</span> — Pyth feed age per bridge dependency.</span></li>
      </ul>

      <div>
        <h2 className="text-xl font-bold tracking-tight">Surfaces</h2>
        <div className="mt-2 h-0.5 w-8 rounded-full bg-accent/50" />
      </div>
      <ul className="list-none space-y-2 text-sm text-text-secondary">
        <li className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span>This dashboard.</span></li>
        <li className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span>REST + WebSocket API — free, open, rate-limited.</span></li>
        <li className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span>On-chain Anchor program <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">radar-oracle</code> on Solana Devnet: <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-accent text-xs">6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM</code></span></li>
        <li className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span><span>Telegram + Discord + webhook alerter for anomaly events.</span></li>
      </ul>

      <div>
        <h2 className="text-xl font-bold tracking-tight">Open source, public good</h2>
        <div className="mt-2 h-0.5 w-8 rounded-full bg-accent/50" />
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">
        MIT (code), CC-BY 4.0 (docs). No token. No equity. Built by Saloni Khan.{" "}
        <Link className="text-accent hover:text-accent-dim transition-colors underline underline-offset-4 decoration-accent/30 hover:decoration-accent" href="https://github.com/Hermit210/Bridge-radar-">
          Source on GitHub
        </Link>.
      </p>

      <div>
        <h2 className="text-xl font-bold tracking-tight">Architecture</h2>
        <div className="mt-2 h-0.5 w-8 rounded-full bg-accent/50" />
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
