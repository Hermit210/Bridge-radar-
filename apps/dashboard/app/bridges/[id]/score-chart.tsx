"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthScore } from "@radar/shared";

export function ScoreChart({ history }: { history: HealthScore[] }) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted">
        No score history yet — the scorer hasn't run.
      </p>
    );
  }
  const data = history.map((h) => ({
    t: new Date(h.computed_at).getTime(),
    score: h.score,
  }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString()}
            stroke="#8a93a4"
            tick={{ fontSize: 10 }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#8a93a4"
            tick={{ fontSize: 10 }}
            width={28}
          />
          <Tooltip
            contentStyle={{ background: "#0f1216", border: "1px solid #1f242c", fontSize: 12 }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#6ea8ff"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
