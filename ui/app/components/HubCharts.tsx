import React from "react";
import { Paragraph } from "@dynatrace/strato-components";
import { theme } from "@utils/themeStyles";

export type NamedCount = { category: string; value: number; color?: string };

export type StackedBarRow = {
  category: string;
  value: Record<string, number>;
};

export type LineSeriesPoint = { t?: number | string; v: number | null | undefined };

const EMPTY: React.CSSProperties = { color: theme.textMuted, fontSize: "13px", margin: 0 };

/** Theme-aligned chart palette (tracks Dynatrace chrome). */
export const hubChartColors = {
  critical: theme.chartCritical,
  warning: theme.chartWarning,
  success: theme.chartSuccess,
  primary: theme.chartPrimary,
  muted: theme.chartMuted,
  series: [
    theme.chartPrimary,
    theme.chartSuccess,
    theme.chartWarning,
    theme.chartCritical,
    theme.chartSeries5,
    theme.chartSeries2,
    theme.chartSeries3,
  ],
} as const;

function truncateLabel(label: string, max = 32): string {
  const text = String(label || "").trim() || "Unknown";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function resolveColor(color: string | undefined, index: number): string {
  if (color) {
    return color;
  }
  return hubChartColors.series[index % hubChartColors.series.length];
}

/** Simple HTML bars — reliable in Dynatrace app iframe (Strato charts were blank). */
export function HtmlBarList({
  data,
  emptyMessage = "No data to chart.",
  onSelectCategory,
}: {
  data: NamedCount[];
  emptyMessage?: string;
  onSelectCategory?: (category: string) => void;
}) {
  const filtered = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  if (filtered.length === 0) {
    return <Paragraph style={EMPTY}>{emptyMessage}</Paragraph>;
  }
  const max = Math.max(...filtered.map((d) => d.value), 1);
  return (
    <div style={{ display: "grid", gap: "8px", padding: "4px 0", width: "100%" }}>
      {filtered.map((row, index) => {
        const pct = Math.max(3, Math.round((row.value / max) * 100));
        const color = resolveColor(row.color, index);
        const clickable = Boolean(onSelectCategory);
        return (
          <div
            key={`${row.category}-${index}`}
            style={{ display: "grid", gap: "4px", cursor: clickable ? "pointer" : undefined }}
            onClick={clickable ? () => onSelectCategory?.(row.category) : undefined}
            onKeyDown={
              clickable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCategory?.(row.category);
                    }
                  }
                : undefined
            }
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px" }}>
              <span style={{ color: theme.text, fontWeight: 600 }} title={row.category}>
                {truncateLabel(row.category)}
              </span>
              <span style={{ color: theme.textSecondary, fontWeight: 600 }}>{row.value}</span>
            </div>
            <div style={{ height: "12px", borderRadius: "4px", backgroundColor: theme.surfaceSubtle, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: "4px" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HtmlLegendList({ data }: { data: NamedCount[] }) {
  const filtered = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  if (filtered.length === 0) {
    return null;
  }
  return (
    <div style={{ display: "grid", gap: "4px", marginTop: "10px", fontSize: "12px", color: theme.text }}>
      {filtered.map((row, index) => (
        <div key={`${row.category}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: resolveColor(row.color, index),
                marginRight: 6,
              }}
            />
            {row.category}
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function HtmlDonut({ data, size = 160 }: { data: NamedCount[]; size?: number }) {
  const filtered = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) {
    return null;
  }
  let cursor = 0;
  const stops: string[] = [];
  filtered.forEach((row, index) => {
    const start = cursor;
    const slice = (row.value / total) * 100;
    cursor += slice;
    const color = resolveColor(row.color, index);
    stops.push(`${color} ${start}% ${cursor}%`);
  });
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(${stops.join(", ")})`,
          position: "relative",
        }}
        role="img"
        aria-label={filtered.map((d) => `${d.category}: ${d.value}`).join(", ")}
      >
        <div
          style={{
            position: "absolute",
            inset: "28%",
            borderRadius: "50%",
            backgroundColor: theme.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: "18px", fontWeight: 700, color: theme.text }}>{total}</div>
          <div style={{ fontSize: "10px", color: theme.textSecondary }}>total</div>
        </div>
      </div>
    </div>
  );
}

/** Horizontal single-series bar chart (e.g. open problems by app). */
export function HubHorizontalBarChart({
  data,
  emptyMessage = "No data to chart.",
  onSelectCategory,
}: {
  data: NamedCount[];
  height?: number;
  emptyMessage?: string;
  onSelectCategory?: (category: string) => void;
}) {
  const filtered = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .map((d, index) => ({
      category: d.category,
      value: d.value,
      color: resolveColor(d.color, index),
    }));
  return <HtmlBarList data={filtered} emptyMessage={emptyMessage} onSelectCategory={onSelectCategory} />;
}

/** Stacked horizontal bar — flattened to total per app with severity colors in legend text. */
export function HubStackedBarChart({
  data,
  emptyMessage = "No data to chart.",
  onSelectCategory,
}: {
  data: StackedBarRow[];
  height?: number;
  emptyMessage?: string;
  onSelectCategory?: (category: string) => void;
}) {
  const filtered = data.filter((d) => Object.values(d.value).some((v) => Number(v) > 0));
  if (filtered.length === 0) {
    return <Paragraph style={EMPTY}>{emptyMessage}</Paragraph>;
  }
  const max = Math.max(
    ...filtered.map((row) => Object.values(row.value).reduce((sum, v) => sum + (Number(v) || 0), 0)),
    1
  );
  const severityColors: Record<string, string> = {
    Critical: hubChartColors.critical,
    High: hubChartColors.warning,
    Medium: hubChartColors.primary,
    Low: hubChartColors.muted,
  };
  return (
    <div style={{ display: "grid", gap: "10px", padding: "4px 0", width: "100%" }}>
      {filtered.map((row) => {
        const segments = Object.entries(row.value).filter(([, v]) => Number(v) > 0);
        const total = segments.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        const widthPct = Math.max(4, Math.round((total / max) * 100));
        const clickable = Boolean(onSelectCategory);
        return (
          <div
            key={row.category}
            style={{ display: "grid", gap: "4px", cursor: clickable ? "pointer" : undefined }}
            onClick={clickable ? () => onSelectCategory?.(row.category) : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px" }}>
              <span style={{ color: theme.text, fontWeight: 600 }} title={row.category}>
                {truncateLabel(row.category)}
              </span>
              <span style={{ color: theme.textSecondary, fontWeight: 600 }}>{total}</span>
            </div>
            <div
              style={{
                height: "14px",
                width: `${widthPct}%`,
                minWidth: "40px",
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
                backgroundColor: theme.surfaceSubtle,
              }}
            >
              {segments.map(([key, value]) => {
                const segPct = Math.max(2, Math.round((Number(value) / total) * 100));
                return (
                  <div
                    key={key}
                    title={`${key}: ${value}`}
                    style={{
                      width: `${segPct}%`,
                      height: "100%",
                      backgroundColor: severityColors[key] || hubChartColors.primary,
                    }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: "11px", color: theme.textMuted }}>
              {segments.map(([key, value]) => `${key} ${value}`).join(" · ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Donut for categorical mix — CSS conic-gradient + legend (always visible). */
export function HubDonutChart({
  data,
  emptyMessage = "No data to chart.",
  showLegendFallback = true,
}: {
  data: NamedCount[];
  height?: number;
  emptyMessage?: string;
  showLegendFallback?: boolean;
}) {
  const filtered = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .map((d, index) => ({
      category: d.category,
      value: d.value,
      color: resolveColor(d.color, index),
    }));
  if (filtered.length === 0) {
    return <Paragraph style={EMPTY}>{emptyMessage}</Paragraph>;
  }
  return (
    <div style={{ width: "100%" }}>
      <HtmlDonut data={filtered} />
      {showLegendFallback ? <HtmlLegendList data={filtered} /> : null}
    </div>
  );
}

function toFiniteSeries(points: LineSeriesPoint[]): number[] {
  const values: number[] = [];
  for (const point of points) {
    const raw = point?.v;
    if (raw === null || raw === undefined) {
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) {
      values.push(n);
    }
  }
  return values;
}

/**
 * Average aligned timeseries buckets across hosts/frontends.
 * Preserves index alignment (null when no samples). Trims leading/trailing
 * empty buckets so charts don't trail to 0 from sparse end pads.
 */
export function averageSeriesArrays(arrays: Array<Array<number | null | undefined> | undefined>): Array<number | null> {
  const usable = arrays.filter((arr): arr is Array<number | null | undefined> => Array.isArray(arr) && arr.length > 0);
  if (usable.length === 0) {
    return [];
  }
  const len = Math.max(...usable.map((arr) => arr.length));
  const out: Array<number | null> = [];
  for (let i = 0; i < len; i += 1) {
    let sum = 0;
    let count = 0;
    for (const arr of usable) {
      const v = arr[i];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) {
        sum += n;
        count += 1;
      }
    }
    out.push(count > 0 ? sum / count : null);
  }
  let start = 0;
  let end = out.length - 1;
  while (start <= end && out[start] === null) {
    start += 1;
  }
  while (end >= start && out[end] === null) {
    end -= 1;
  }
  return start <= end ? out.slice(start, end + 1) : [];
}

/** Lightweight SVG line/area chart for Mission Control timeseries. */
export function HubLineChart({
  points,
  values,
  color = hubChartColors.primary,
  height = 140,
  emptyMessage = "No timeseries data.",
  unitSuffix = "",
}: {
  points?: LineSeriesPoint[];
  /** Convenience: pass a plain number array */
  values?: Array<number | null | undefined>;
  color?: string;
  height?: number;
  emptyMessage?: string;
  unitSuffix?: string;
}) {
  const series =
    points && points.length > 0
      ? toFiniteSeries(points)
      : (values || [])
          .map((v) => {
            if (v === null || v === undefined) {
              return null;
            }
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? n : null;
          })
          .filter((v): v is number => v !== null);

  if (series.length < 2) {
    return <Paragraph style={EMPTY}>{emptyMessage}</Paragraph>;
  }

  const width = 320;
  const padX = 8;
  const padY = 12;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const coords = series.map((v, i) => {
    const x = padX + (i / (series.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (v - min) / span) * (height - padY * 2);
    return { x, y, v };
  });
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(height - padY).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - padY).toFixed(1)} Z`;
  const latest = series[series.length - 1];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
        <span style={{ fontSize: "18px", fontWeight: 700, color: theme.text }}>
          {Number.isFinite(latest) ? `${latest.toFixed(latest >= 10 ? 0 : 1)}${unitSuffix}` : "-"}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="timeseries">
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke={theme.border}
          strokeWidth={1}
        />
        <path d={areaPath} fill={color} opacity={0.15} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: theme.textMuted }}>
        <span>
          min {min.toFixed(min >= 10 ? 0 : 1)}
          {unitSuffix}
        </span>
        <span>
          max {max.toFixed(max >= 10 ? 0 : 1)}
          {unitSuffix}
        </span>
      </div>
    </div>
  );
}
