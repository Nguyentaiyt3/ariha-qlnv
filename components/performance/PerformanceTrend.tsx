"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

export interface TrendDataPoint {
  period: string;
  executionScore: number;
  qualitativeScore: number;
  totalScore: number;
}

interface Props {
  data: TrendDataPoint[];
  showLegend?: boolean;
}

export default function PerformanceTrend({ data, showLegend = true }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--muted-foreground)] text-sm">
        Chưa có dữ liệu xu hướng
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="period" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [
            `${value} điểm`,
            name === "totalScore" ? "Tổng" : name === "executionScore" ? "Thực thi" : "Định tính",
          ]}
        />
        {showLegend && (
          <Legend
            formatter={(value) =>
              value === "totalScore" ? "Tổng điểm" : value === "executionScore" ? "Thực thi (60%)" : "Định tính (40%)"
            }
            wrapperStyle={{ fontSize: 12 }}
          />
        )}
        <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "Tốt", fontSize: 11, fill: "#22c55e" }} />
        <Line type="monotone" dataKey="totalScore" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="executionScore" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
        <Line type="monotone" dataKey="qualitativeScore" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
