import Link from "next/link";
import { bandOf, formatUsd, type BridgeWithHealth } from "@radar/shared";

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
  const defillama = bridge.defillama;

  return (
    <Link
      href={`/bridges/${bridge.id}`}
      className="group block glass-card-interactive p-5"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold group-hover:text-accent-bright transition-colors duration-150">
            {bridge.display_name}
          </h3>
          <p className="text-[11px] text-muted-dark font-mono mt-0.5">{bridge.id}</p>
        </div>
        <div className={`text-2xl font-bold font-mono tabular-nums ${bandColor[band]}`}>
          {score ?? "—"}
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-4 flex items-center gap-2.5">
        <div className="flex-1 health-bar">
          <div
            className={`health-bar-fill ${bandBarClass[band]}`}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-dark tabular-nums w-7 text-right">{score ?? 0}%</span>
      </div>

      {/* Status and time */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={`status-dot ${bandDot[band]}`}></span>
          <span className={bandColor[band]}>{bandLabel[band]}</span>
        </span>
        <span className="text-muted-dark font-mono text-[11px]">
          {bridge.health?.computed_at
            ? new Date(bridge.health.computed_at).toLocaleTimeString()
            : "no score yet"}
        </span>
      </div>

      {/* DeFiLlama context — real protocol TVL, external reference only */}
      {defillama && (
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Protocol TVL</span>
            <span className="font-mono text-text-secondary tabular-nums">{formatUsd(defillama.tvl_usd)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-dark">
            <span>via DeFiLlama ({defillama.defillama_name})</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-dark opacity-50 group-hover:opacity-80 transition-opacity">
        v0-naive &middot; parity + outflow only
      </p>
    </Link>
  );
}
