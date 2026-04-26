
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24 space-y-20">
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1 text-xs text-muted">
          <span className="text-green">●</span> Live on Solana Devnet
        </div>
        <h1 className="text-5xl font-semibold tracking-tight leading-tight">
          Real-time Bridge Health for Solana
        </h1>
        <p className="text-lg text-muted max-w-2xl mx-auto">
          Bridge Radar monitors every bridge with a Solana leg and gives you a single answer:{" "}
          <strong className="text-text">is this bridge safe right now?</strong>
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/bridges" className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-black hover:opacity-90 transition">
            View Live Dashboard
          </Link>
          <a href="https://github.com/Hermit210/Bridge-radar-" target="_blank" rel="noreferrer" className="rounded-lg border border-border px-6 py-3 text-sm text-muted hover:text-text transition">
            GitHub
          </a>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-6 text-center">
        {[
          { value: "7", label: "Bridges Monitored" },
          { value: "$2.8B+", label: "Lost to Bridge Exploits" },
          { value: "100%", label: "Open Source" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-6 space-y-2">
            <div className="text-3xl font-semibold">{s.value}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">What it detects</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { title: "Lock vs Mint Parity", desc: "Detects asset imbalances across origin chain and Solana in real-time." },
            { title: "Outflow Anomaly", desc: "Z-score analysis over a rolling 30-day baseline flags unusual withdrawals." },
            { title: "Signer Set Changes", desc: "Watches Guardian, DVN, and signer rotations across all supported bridges." },
            { title: "Frontend Hijack Detection", desc: "Monitors bundle hashes to catch frontend attacks." },
            { title: "Oracle Staleness", desc: "Checks price feed freshness that bridges depend on." },
            { title: "On-chain Health Oracle", desc: "dApps can gate withdrawals based on live bridge health scores." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5 space-y-2">
              <div className="text-sm font-medium">{f.title}</div>
              <div className="text-sm text-muted">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center space-y-4 rounded-xl border border-border bg-surface p-10">
        <h2 className="text-2xl font-semibold">Ready to check bridge health?</h2>
        <p className="text-muted text-sm">Live data. No token. No signup. Fully open source.</p>
        <Link href="/bridges" className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-black hover:opacity-90 transition">
          Open Dashboard
        </Link>
      </section>

      <footer className="text-center text-xs text-muted">
        Built by Khan Saloni · MIT License · No token · Public Good
      </footer>
    </div>
  );
}


