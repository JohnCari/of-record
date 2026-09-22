"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type SweepPoint = {
  threshold: number;
  missRate: number;
  falseHoldRate: number;
  decidedWithoutAPerson: number;
};

// Series colours carry identity only. Status colours are reserved for sentence status.
// The share decided without a person runs at 70 to 92 percent, so it lives in the table below:
// on a shared axis it would flatten the two error rates this chart exists to show.
const config = {
  missRate: { label: "Bad sentences missed", color: "var(--series-2)" },
  falseHoldRate: { label: "Sound sentences held", color: "var(--series-1)" },
} satisfies ChartConfig;

export function SweepChart({ points, current }: { points: SweepPoint[]; current: number }) {
  // The thresholds are unevenly spaced on purpose, so they are plotted as ordered categories.
  const data = points.map((point) => ({
    threshold: point.threshold.toFixed(2),
    missRate: Math.round(point.missRate * 1000) / 10,
    falseHoldRate: Math.round(point.falseHoldRate * 1000) / 10,
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis dataKey="threshold" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          domain={[0, 20]}
          ticks={[0, 5, 10, 15, 20]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <ReferenceLine
          x={current.toFixed(2)}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: "in use",
            position: "top",
            fill: "var(--muted-foreground)",
            fontSize: 12,
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Bar ${label}`}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config].label}
                  </span>
                  <span className="font-medium tabular-nums">{value}%</span>
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {(Object.keys(config) as (keyof typeof config)[]).map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="linear"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: `var(--color-${key})` }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
