import React from "react";
import { theme } from "@utils/themeStyles";

interface StatusPillProps {
  tone: "success" | "warning" | "critical";
  label: string;
}

/**
 * StatusPill Component - Health/state indicator
 */
export const StatusPill: React.FC<StatusPillProps> = ({ tone, label }) => {
  const colors = {
    success: { bg: theme.successText, text: theme.textOnAccent },
    warning: { bg: theme.warningEmphasized, text: theme.text },
    critical: { bg: theme.criticalText, text: theme.textOnAccent },
  };

  const style = colors[tone];

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: "bold",
      }}
    >
      {label}
    </span>
  );
};
