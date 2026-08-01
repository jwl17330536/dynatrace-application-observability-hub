import React from "react";
import { Paragraph } from "@dynatrace/strato-components";
import { theme } from "@utils/themeStyles";

export function SectionIntro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "14px", fontWeight: 700, color: theme.text }}>{title}</div>
      {children ? (
        <Paragraph style={{ margin: "4px 0 0 0", color: theme.textSecondary, fontSize: "12px" }}>{children}</Paragraph>
      ) : null}
    </div>
  );
}

export function ColorLegend() {
  return (
    <Paragraph style={{ margin: "0 0 12px 0", color: theme.textMuted, fontSize: "12px" }}>
      Legend:{" "}
      <span style={{ color: theme.criticalText, fontWeight: 600 }}>red</span> = needs attention ·{" "}
      <span style={{ color: theme.successText, fontWeight: 600 }}>green</span> = healthy coverage · neutral = zero / N/A
    </Paragraph>
  );
}
