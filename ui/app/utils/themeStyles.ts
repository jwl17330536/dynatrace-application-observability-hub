/**
 * Theme-aware style tokens using Strato CSS variables.
 * These flip automatically with Dynatrace light/dark chrome.
 */
export const theme = {
  surface: "var(--dt-colors-theme-background-20)",
  surfaceSubtle: "var(--dt-colors-theme-neutral-10)",
  surfaceZebra: "var(--dt-colors-theme-neutral-20)",
  border: "var(--dt-colors-theme-neutral-40)",
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
} as const;

export type ThemeTokens = typeof theme;
