/**
 * Theme-aware style tokens using Strato CSS variables.
 * Aligned to Dynatrace chrome page anatomy (auto light/dark via AppRoot).
 */
export const theme = {
  /** Page / canvas behind cards */
  pageBg: "var(--dt-colors-theme-background-10)",
  /** Cards, tables, widgets */
  surface: "var(--dt-colors-theme-background-20)",
  surfaceSubtle: "var(--dt-colors-theme-neutral-10)",
  surfaceZebra: "var(--dt-colors-theme-neutral-20)",
  /** Thin dividers — prefer subtle over heavy chrome */
  border: "var(--dt-colors-theme-neutral-30)",
  borderStrong: "var(--dt-colors-theme-neutral-40)",
  text: "var(--dt-colors-theme-foreground-10)",
  textSecondary: "var(--dt-colors-theme-neutral-70)",
  textMuted: "var(--dt-colors-theme-neutral-60)",
  textOnAccent: "var(--dt-colors-theme-foreground-20)",
  primary: "var(--dt-colors-theme-primary-70)",
  primaryText: "var(--dt-colors-theme-primary-90)",
  primarySubtle: "var(--dt-colors-theme-primary-10)",
  successText: "var(--dt-colors-theme-success-70)",
  successBg: "var(--dt-colors-theme-success-10)",
  warningBg: "var(--dt-colors-theme-warning-10)",
  warningBorder: "var(--dt-colors-theme-warning-40)",
  warningText: "var(--dt-colors-theme-warning-90)",
  warningEmphasized: "var(--dt-colors-theme-warning-70)",
  criticalBg: "var(--dt-colors-theme-critical-10)",
  criticalBorder: "var(--dt-colors-theme-critical-40)",
  criticalText: "var(--dt-colors-theme-critical-70)",
  accentBg: "var(--dt-colors-theme-primary-20)",
  /** Chart / meter series — CSS vars so they track chrome theme */
  chartCritical: "var(--dt-colors-theme-critical-70)",
  chartWarning: "var(--dt-colors-theme-warning-70)",
  chartSuccess: "var(--dt-colors-theme-success-70)",
  chartPrimary: "var(--dt-colors-theme-primary-70)",
  chartMuted: "var(--dt-colors-theme-neutral-50)",
  chartSeries2: "var(--dt-colors-theme-success-60)",
  chartSeries3: "var(--dt-colors-theme-warning-60)",
  chartSeries4: "var(--dt-colors-theme-critical-60)",
  chartSeries5: "var(--dt-colors-theme-primary-50)",
  chartSeries6: "var(--dt-colors-theme-neutral-70)",
} as const;

/**
 * Dashboard density (v0.1.60) — Flow Analyst–like compact tables.
 * Visual only; does not change queries or widget behavior.
 */
export const density = {
  pagePadding: "20px",
  pageMaxWidth: "1600px",
  cardPadding: "12px",
  cardRadius: "4px",
  cardGap: "10px",
  widgetTitleSize: "15px",
  kpiValueSize: "28px",
  tableFontSize: "12px",
  thPadding: "6px 8px",
  tdPadding: "6px 8px",
  thFontSize: "11px",
} as const;

export type ThemeTokens = typeof theme;
