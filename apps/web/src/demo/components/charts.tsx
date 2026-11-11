"use client";

import { useId, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "./theme";

const AXIS_TICK = { fontSize: 11 } as const;
const ANIMATION_MS = 1100;

type Formatter = (value: number) => string;

/** Glass tooltip shared by every chart. */
function GlassTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
  label?: ReactNode;
  format: (value: number, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-xl">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          {item.name}: <span className="font-semibold text-fg tabular">{format(Number(item.value ?? 0), item.name)}</span>
        </p>
      ))}
    </div>
  );
}

export function Sparkline({ data, height = 44, color }: { data: readonly number[]; height?: number; color?: string }) {
  const c = useChartColors();
  const id = useId();
  const stroke = color ?? c.primary;
  const points = data.map((value, i) => ({ i, value }));
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${id})`} animationDuration={ANIMATION_MS} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export type TrendPoint = { label: string; current: number; previous?: number | undefined };

/** Current period as a filled area, previous period as a dashed grey line. */
export function TrendArea({ data, format, height = 260 }: { data: readonly TrendPoint[]; format: Formatter; height?: number }) {
  const c = useChartColors();
  const id = useId();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.primary} stopOpacity={0.45} />
              <stop offset="100%" stopColor={c.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} tickFormatter={format} width={64} />
          <Tooltip content={<GlassTooltip format={format} />} cursor={{ stroke: c.accent, strokeOpacity: 0.4 }} />
          <Area name="Previous period" type="monotone" dataKey="previous" stroke={c.grey} strokeDasharray="5 5" strokeWidth={1.5} fill="none" animationDuration={ANIMATION_MS} />
          <Area
            name="This period"
            type="monotone"
            dataKey="current"
            stroke={c.primary}
            strokeWidth={2.5}
            fill={`url(#${id})`}
            activeDot={{ r: 5, strokeWidth: 0, fill: c.accent }}
            animationDuration={ANIMATION_MS + 300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export type Slice = { name: string; value: number };

export function Donut({ data, center, format, height = 200 }: { data: readonly Slice[]; center: ReactNode; format: Formatter; height?: number }) {
  const c = useChartColors();
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[...data]} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="96%" paddingAngle={2} stroke="none" animationDuration={ANIMATION_MS}>
            {data.map((slice, i) => (
              <Cell key={slice.name} fill={c.series[i % c.series.length] ?? c.primary} />
            ))}
          </Pie>
          <Tooltip content={<GlassTooltip format={format} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

export type BarLinePoint = { label: string; bar: number; line: number };

/** Bars on the left axis (e.g. spend) with a line on the right axis (e.g. ROAS). */
export function BarLine({
  data,
  barName,
  lineName,
  formatBar,
  formatLine,
  height = 280,
}: {
  data: readonly BarLinePoint[];
  barName: string;
  lineName: string;
  formatBar: Formatter;
  formatLine: Formatter;
  height?: number;
}) {
  const c = useChartColors();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={[...data]} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} interval={0} />
          <YAxis yAxisId="bar" tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} tickFormatter={formatBar} width={60} />
          <YAxis yAxisId="line" orientation="right" tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} tickFormatter={formatLine} width={44} />
          <Tooltip
            content={<GlassTooltip format={(v, name) => (name === lineName ? formatLine(v) : formatBar(v))} />}
            cursor={{ fill: c.grid }}
          />
          <Bar yAxisId="bar" name={barName} dataKey="bar" fill={c.primary} radius={[6, 6, 0, 0]} maxBarSize={44} animationDuration={ANIMATION_MS} />
          <Line yAxisId="line" name={lineName} dataKey="line" stroke={c.soft} strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3.5, fill: c.soft, strokeWidth: 0 }} animationDuration={ANIMATION_MS + 400} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniLine({ data, height = 160, format }: { data: readonly { label: string; value: number }[]; height?: number; format: Formatter }) {
  const c = useChartColors();
  const id = useId();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.primary} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} />
          <YAxis tick={{ ...AXIS_TICK, fill: c.axis }} tickLine={false} axisLine={false} tickFormatter={format} width={44} />
          <Tooltip content={<GlassTooltip format={format} />} />
          <Area name="Value" type="monotone" dataKey="value" stroke={c.primary} strokeWidth={2.5} fill={`url(#${id})`} dot={{ r: 3, fill: c.primary, strokeWidth: 0 }} animationDuration={ANIMATION_MS} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
