import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";
import { IGNORE_COLUMN_VALUE, type MappingConfig } from "@utils/documentStore";
import { theme } from "@utils/themeStyles";

interface CountRecord {
  count: number;
}

function toLookupPath(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("/lookups/")) {
    return trimmed;
  }
  if (trimmed.startsWith("lookups/")) {
    return `/${trimmed}`;
  }
  return `/lookups/${trimmed}`;
}

function formatOptionalColumn(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === IGNORE_COLUMN_VALUE) {
    return "Ignored";
  }
  return trimmed;
}

function getUniqueApplicationIdColumn(config: MappingConfig): string {
  const source =
    config.sources.find((item) => item.sourceId === config.applicationVariables.cmdbVariableSourceId) ||
    config.sources.find((item) => item.sourceId === config.defaultSourceId) ||
    config.sources[0];
  const uniqueField = source?.fields.find((field) => field.id === "uniqueApplicationId");
  return uniqueField?.sourceColumn.trim() || config.applicationVariables.cmdbApplicationIdColumn || "—";
}

function SourceCount({ table }: { table: string }) {
  const query = `load "${toLookupPath(table)}" | summarize count = count()`;
  const { data, isLoading, error } = useDql({ query });

  if (isLoading) {
    return <span style={{ color: theme.textSecondary }}>…</span>;
  }
  if (error) {
    return <span style={{ color: theme.criticalText }}>err</span>;
  }

  const count = (data?.records?.[0] as CountRecord | undefined)?.count ?? 0;
  return <span style={{ fontWeight: 700 }}>{count}</span>;
}

export const Summary: React.FC = () => {
  const navigate = useNavigate();
  const { config, isLoading, error } = useMappingConfig();

  if (isLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Configuration</Heading>
        <Paragraph style={{ marginTop: "8px", color: theme.textSecondary }}>Loading configuration...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Configuration</Heading>
        <Paragraph style={{ color: theme.criticalText }}>Failed to load configuration: {error}</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="default">
          Go to Setup
        </Button>
      </div>
    );
  }

  if (!config || !config.sources.length) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Configuration</Heading>
        <Paragraph>No lookup sources are configured yet.</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="emphasized">
          Configure Sources
        </Button>
      </div>
    );
  }

  const vars = config.applicationVariables;
  const cmdbIdColumn = getUniqueApplicationIdColumn(config);
  const dtExpression = vars.dynatraceApplicationIdFieldPath?.trim() || "—";

  return (
    <div style={{ padding: "32px", maxWidth: "960px", margin: "0 auto", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "24px",
          right: "24px",
          maxWidth: "280px",
          border: `1px solid ${theme.border}`,
          borderRadius: "8px",
          padding: "10px 12px",
          backgroundColor: theme.surfaceSubtle,
          fontSize: "12px",
          color: theme.textSecondary,
        }}
      >
        <div style={{ fontWeight: 700, color: theme.text, marginBottom: "6px", fontSize: "11px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Lookup sources
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {config.sources.map((source) => {
            const isDefault = source.sourceId === config.defaultSourceId;
            return (
              <div key={source.sourceId}>
                <div style={{ color: theme.text, fontWeight: 600 }}>
                  {source.label}
                  {isDefault ? " · Default" : ""}
                </div>
                <div>
                  <code>{source.lookupTableName}</code> · rows: <SourceCount table={source.lookupTableName} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: "560px", paddingRight: "300px" }}>
        <Heading level={1} style={{ margin: 0 }}>
          Configuration saved
        </Heading>
        <Paragraph style={{ marginTop: "10px", color: theme.textSecondary }}>
          Your join is ready. Open the Application Dashboard to see coverage and signal health.
        </Paragraph>

        <div
          style={{
            marginTop: "18px",
            padding: "14px 16px",
            border: `1px solid ${theme.border}`,
            borderRadius: "8px",
            backgroundColor: theme.surface,
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Join keys
          </div>
          <Paragraph style={{ margin: "8px 0 0 0", color: theme.text, fontSize: "14px" }}>
            Lookup <code>{cmdbIdColumn}</code>
            {" ↔ "}
            Dynatrace <code>{dtExpression}</code>
          </Paragraph>
          <Paragraph style={{ margin: "8px 0 0 0", color: theme.textSecondary, fontSize: "13px" }}>
            Name: {formatOptionalColumn(vars.cmdbApplicationNameColumn)} · Owner:{" "}
            {formatOptionalColumn(vars.cmdbOwnerColumn)} · Tier: {formatOptionalColumn(vars.cmdbTierColumn)}
          </Paragraph>
        </div>

        <div style={{ marginTop: "28px" }}>
          <Button onClick={() => navigate("/overview")} variant="emphasized">
            Open Application Dashboard
          </Button>
        </div>

        <div style={{ marginTop: "16px" }}>
          <Button onClick={() => navigate("/setup")} variant="default">
            Reconfigure
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Summary;
