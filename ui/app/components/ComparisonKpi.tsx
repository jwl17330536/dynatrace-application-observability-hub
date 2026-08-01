import React from "react";
import { MeterBarChart } from "@dynatrace/strato-components/charts";
import { density, theme } from "@utils/themeStyles";

export type ComparisonKpiProps = {
  title: string;
  numerator: number;
  denominator: number;
  subtitle?: string;
  /** When ratio is below this (0–1), emphasize the value. Default 0.9. */
  healthyThreshold?: number;
  /** Force attention color when true (e.g. gaps exist). */
  attention?: boolean;
};

class MeterErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * X/Y coverage KPI with MeterBar — e.g. "45/60 hosts full stack".
 */
export function ComparisonKpi({
  title,
  numerator,
  denominator,
  subtitle,
  healthyThreshold = 0.9,
  attention,
}: ComparisonKpiProps) {
  const safeNum = Number.isFinite(numerator) ? Math.max(0, numerator) : 0;
  const safeDen = Number.isFinite(denominator) ? Math.max(0, denominator) : 0;
  const ratio = safeDen > 0 ? safeNum / safeDen : 0;
  const isHealthy = attention ? false : safeDen === 0 ? true : ratio >= healthyThreshold;
  const valueColor = attention || (safeDen > 0 && !isHealthy) ? theme.criticalText : theme.successText;
  const barColor = isHealthy ? "#2c8b57" : "#c33c54";
  const pct = safeDen > 0 ? Math.max(2, Math.round(ratio * 100)) : 0;

  const htmlMeter = (
    <div style={{ height: "10px", borderRadius: "4px", backgroundColor: theme.surfaceSubtle, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: barColor, borderRadius: "4px" }} />
    </div>
  );

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: density.cardRadius,
        padding: density.cardPadding,
        backgroundColor: theme.surface,
        display: "grid",
        gap: "8px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 700, color: theme.text }}>{title}</div>
      <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: valueColor, lineHeight: 1.1 }}>
        {safeNum}
        <span style={{ fontSize: "18px", fontWeight: 600, color: theme.textSecondary }}>/{safeDen}</span>
      </div>
      {subtitle ? (
        <div style={{ fontSize: "12px", color: theme.textSecondary }}>{subtitle}</div>
      ) : null}
      <MeterErrorBoundary fallback={htmlMeter}>
        <div style={{ minHeight: 36, width: "100%" }}>
          <MeterBarChart
            value={safeDen > 0 ? safeNum : 0}
            min={0}
            max={safeDen > 0 ? safeDen : 1}
            color={barColor}
            size="size16"
            height={36}
            width="100%"
          />
        </div>
      </MeterErrorBoundary>
    </div>
  );
}
