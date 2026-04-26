import Link from "next/link";
export const metadata = { title: "About — Bridge Radar" };
export default function AboutPage() {
  return (
    <article className="prose prose-invert max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">About Bridge Radar</h1>
      <p className="text-muted">
        Bridge Radar is a real-time bridge-health intelligence layer for
        Solana. It monitors every bridge with a Solana leg and exposes a
        single answer for users, dApps, and Foundation reviewers:{" "}
        <em>is this bridge healthy right now?</em>
      </p>
      <h2 className="text-xl font-semibold">Detectors</h2>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted">
        <li><span className="text-text">Parity</span> — origin-side lock/unlock vs. Solana-side mint/burn.</li>
        <li><span className="text-text">Outflow</span> — z-score over rolling 30-day distribution of 5-min bucket counts.</li>
        <li><span className="text-text">Signer-set drift</span> — diffs the canonical signer registry per bridge.</li>
        <li><span className="text-text">Frontend hash</span> — sha256 of each bridge&apos;s served bundle.</li>
        <li><span className="text-text">Oracle staleness</span> — Pyth feed age per bridge dependency.</li>
      </ul>
      <h2 className="text-xl font-semibold">Surfaces</h2>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted">
        <li>This dashboard.</li>
        <li>REST + WebSocket API — free, open, rate-limited.</li>
        <li>On-chain Anchor program <code>radar-oracle</code> on Solana Devnet: <code>6148M4aXYbDsscWn14zCazPy9V4fQFGozdDQp4LFmqHM</code></li>
        <li>Telegram + Discord + webhook alerter for anomaly events.</li>
      </ul>
      <h2 className="text-xl font-semibold">Open source, public good</h2>
      <p className="text-sm text-muted">
        MIT (code), CC-BY 4.0 (docs). No token. No equity. Built by Khan Saloni.{" "}
        <Link className="text-accent" href="https://github.com/Hermit210/Bridge-radar-">
          Source on GitHub
        </Link>.
      </p>
      <h2 className="text-xl font-semibold">Architecture</h2>
      <p className="text-sm text-muted">
        Rust cargo workspace for ingestion + scoring + attestation; pnpm
        workspace for API + dashboard; Anchor program for the on-chain
        oracle. Storage trait abstracted over SQLite (dev) and
        Postgres+Timescale (prod). See{" "}
        <Link className="text-accent" href="https://github.com/Hermit210/Bridge-radar-/blob/master/ARCHITECTURE.md">
          ARCHITECTURE.md
        </Link>.
      </p>
    </article>
  );
}