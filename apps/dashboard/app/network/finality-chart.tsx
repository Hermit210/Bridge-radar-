"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinalityObservation } from "@/lib/api";

export function FinalityChart({
  observations,
  baselineMs,
}: {
  observations: FinalityObservation[];
  /** Current real rolling baseline, drawn as a reference line for visual
   * context — the same value GET /v1/network/finality returns. */
  baselineMs: number | null;
}) {
  if (observations.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-sm text-muted">
        No real finality observations in this window yet — the indexer's finality tracker records one
        per real confirmed→finalized slot transition; check back shortly.
      </div>
    );
  }

  const data = observations.map((o) => ({
    t: new Date(o.finalizedAt).getTime(),
    elapsedMs: o.elapsedMs,
    isAnomalous: o.isAnomalous,
    slot: o.slot,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="finalityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e0a530" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#e0a530" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(58,53,44,0.45)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            stroke="#3a352c"
            tick={{ fontSize: 10, fill: "#5f5548" }}
          />
          <YAxis
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}s`}
            stroke="#3a352c"
            tick={{ fontSize: 10, fill: "#5f5548" }}
            width={40}
          />
          {baselineMs !== null && (
            <ReferenceLine
              y={baselineMs}
              stroke="#8a8578"
              strokeDasharray="4 4"
              label={{ value: "real baseline", position: "insideTopRight", fill: "#8a8578", fontSize: 10 }}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "rgba(26,24,21,0.96)",
              border: "1px solid rgba(58,53,44,0.65)",
              borderRadius: "0.5rem",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
            formatter={(value: number, _name, item) => [
              `${value.toLocaleString()}ms${item.payload.isAnomalous ? " — anomalous" : ""}`,
              `slot ${item.payload.slot}`,
            ]}
          />
          <Area
            type="monotone"
            dataKey="elapsedMs"
            stroke="#e0a530"
            strokeWidth={2}
            fill="url(#finalityGradient)"
            fillOpacity={1}
            dot={(props: { cx?: number; cy?: number; payload?: { isAnomalous?: boolean } }) => {
              const { cx, cy, payload } = props;
              if (!payload?.isAnomalous || cx === undefined || cy === undefined) {
                return <g key={`dot-${cx}-${cy}`} />;
              }
              return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#c94f4f" stroke="#1a1815" strokeWidth={1} />;
            }}
            activeDot={{ r: 4, stroke: "#e0a530", strokeWidth: 2, fill: "#1a1815" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
