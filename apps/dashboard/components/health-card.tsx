import Link from "next/link";
import { bandOf, type BridgeWithHealth } from "@radar/shared";

const bandColor = {
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
} as const;

const bandLabel = {
  green: "Healthy",
  yellow: "Watch",
  red: "Alert",
} as const;

const bandBarClass = {
  green: "health-bar-green",
  yellow: "health-bar-yellow",
  red: "health-bar-red",
} as const;

const bandDot = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
} as const;

export function HealthCard({ bridge }: { bridge: BridgeWithHealth }) {
  const score = bridge.health?.score;
  const band = score !== undefined ? bandOf(score) : "yellow";
  const defilama = bridge.defilama;

  return (
    <Link
      href={`/bridges/${bridge.id}`}
      className="group block glass-card p-5 transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 hover:border-accent/30"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-lg font-semibold group-hover:text-accent transition-colors duration-200">
            {bridge.display_name}
          </h3>
          <p className="text-xs text-muted-dark font-mono">{bridge.id}</p>
        </div>
        <div className={`text-3xl font-bold font-mono tabular-nums ${bandColor[band]}`}>
          {score ?? "—"}
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-4 health-bar">
        <div
          className={`health-bar-fill ${bandBarClass[band]}`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>

      {/* Status and time */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={`status-dot ${bandDot[band]}`}></span>
          <span className={bandColor[band]}>{bandLabel[band]}</span>
        </span>
        <span className="text-muted-dark font-mono">
          {bridge.health?.computed_at
            ? new Date(bridge.health.computed_at).toLocaleTimeString()
            : "no score yet"}
        </span>
      </div>

      {/* DeFiLlama context */}
      {defilama && (
        <div className="mt-3 space-y-1 border-t border-border-subtle pt-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted">TVL</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.tvlFormatted}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">24h Vol</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.volumeFormatted}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Chains</span>
            <span className="font-mono text-text-secondary tabular-nums">{defilama.chains.length}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-dark opacity-60 group-hover:opacity-100 transition-opacity">
        algorithm: v0-naive · parity + outflow only
      </p>
    </Link>
  );
}
