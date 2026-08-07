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
  color = "#e0a530",
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
            stroke="rgba(58,53,44,0.45)"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            stroke="#3a352c"
            tick={{ fontSize: 10, fill: "#5f5548" }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#3a352c"
            tick={{ fontSize: 10, fill: "#5f5548" }}
            width={28}
          />
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
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: "#1a1815" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
