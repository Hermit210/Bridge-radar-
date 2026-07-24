"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthScore } from "@radar/shared";

export function ScoreChart({
  history,
  color = "#d4a574",
  height = "h-56",
}: {
  history: HealthScore[];
  /** Line/fill color — pass the current band's color so the centerpiece
   * chart reflects real status, not a fixed brand tint regardless of health. */
  color?: string;
  height?: string;
}) {
  if (history.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-sm text-muted">
        No score history yet — the scorer hasn&apos;t run.
      </div>
    );
  }
  const data = history.map((h) => ({
    t: new Date(h.computed_at).getTime(),
    score: h.score,
  }));
  const gradientId = `scoreGradient-${color.replace("#", "")}`;
  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(42,53,68,0.45)"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            stroke="#2a3544"
            tick={{ fontSize: 10, fill: "#5a6478" }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#2a3544"
            tick={{ fontSize: 10, fill: "#5a6478" }}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(20,26,40,0.96)",
              border: "1px solid rgba(42,53,68,0.65)",
              borderRadius: "0.5rem",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: "#141a28" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
