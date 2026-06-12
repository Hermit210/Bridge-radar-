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

export function ScoreChart({ history }: { history: HealthScore[] }) {
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
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6387d2" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#6387d2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(30,39,64,0.4)"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            stroke="#1e2740"
            tick={{ fontSize: 10, fill: "#475470" }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#1e2740"
            tick={{ fontSize: 10, fill: "#475470" }}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(20,26,38,0.95)",
              border: "1px solid rgba(30,39,64,0.6)",
              borderRadius: "0.5rem",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6387d2"
            strokeWidth={2}
            fill="url(#scoreGradient)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, stroke: "#6387d2", strokeWidth: 2, fill: "#141a26" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
