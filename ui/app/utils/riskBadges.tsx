import React from "react";
import { theme } from "@utils/themeStyles";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | string;

export const DEFAULT_ATTENTION_RISKS: ReadonlySet<string> = new Set(["CRITICAL", "HIGH"]);

export function normalizeRiskLevel(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function riskBadgeStyle(level: unknown): React.CSSProperties {
  const risk = normalizeRiskLevel(level);
  if (risk === "CRITICAL") {
    return {
      color: theme.criticalText,
      backgroundColor: theme.criticalBg,
      border: `1px solid ${theme.criticalBorder}`,
    };
  }
  if (risk === "HIGH") {
    return {
      color: theme.warningEmphasized,
      backgroundColor: theme.warningBg,
      border: `1px solid ${theme.warningBorder}`,
    };
  }
  if (risk === "MEDIUM") {
    return {
      color: theme.text,
      backgroundColor: theme.surfaceSubtle,
      border: `1px solid ${theme.border}`,
    };
  }
  if (risk === "LOW" || risk === "NONE") {
    return {
      color: theme.textSecondary,
      backgroundColor: theme.surfaceSubtle,
      border: `1px solid ${theme.border}`,
    };
  }
  return {
    color: theme.textSecondary,
    backgroundColor: theme.surfaceSubtle,
    border: `1px solid ${theme.border}`,
  };
}

export function RiskBadge({ level }: { level: unknown }) {
  const label = normalizeRiskLevel(level) || "—";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 700,
        borderRadius: "4px",
        padding: "2px 6px",
        lineHeight: 1.2,
        ...riskBadgeStyle(label),
      }}
    >
      {label}
    </span>
  );
}

export function SeverityChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: "12px",
        fontWeight: 700,
        borderRadius: "4px",
        padding: "4px 10px",
        cursor: "pointer",
        border: active ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
        backgroundColor: active ? theme.primarySubtle : theme.surface,
        color: active ? theme.primaryText : theme.text,
      }}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}
